/*
 * Web Push with WebCrypto only, so it runs on Cloudflare Workers.
 *
 *   Encryption: RFC 8291 (aes128gcm content coding, RFC 8188).
 *   Signing:    RFC 8292 (VAPID), an ES256 JWT for the push service.
 *
 * Keys are base64url, as `npx web-push generate-vapid-keys` prints them.
 */

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type Vapid = { publicKey: string; privateKey: string; subject: string };

const encoder = new TextEncoder();

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function toBase64Url(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let raw = "";
  for (const b of view) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** HKDF-SHA-256 (extract and expand) to `length` bytes. */
async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/** Encrypts `payload` for one browser (RFC 8291). Returns the request body. */
export async function encryptPayload(
  target: Pick<PushTarget, "p256dh" | "auth">,
  payload: Uint8Array<ArrayBuffer>,
  salt?: Uint8Array<ArrayBuffer>,
) {
  const uaPublic = fromBase64Url(target.p256dh);
  const authSecret = fromBase64Url(target.auth);
  const recordSalt = salt ?? crypto.getRandomValues(new Uint8Array(16));

  // A fresh key pair for each message.
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const cek = await hkdf(recordSalt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(recordSalt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  // One record: the payload, then the 0x02 delimiter that marks the last record.
  const plaintext = concat(payload, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));

  // Header: salt (16) | record size (4) | key id length (1) | key id (our public key).
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(recordSalt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/** The VAPID Authorization header for a push service (RFC 8292). */
export async function vapidAuthorization(endpoint: string, vapid: Vapid, now = Date.now()) {
  const publicKey = fromBase64Url(vapid.publicKey);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: vapid.privateKey,
    x: toBase64Url(publicKey.slice(1, 33)),
    y: toBase64Url(publicKey.slice(33, 65)),
    ext: true,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = toBase64Url(
    encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })),
  );
  const unsigned = `${header}.${claims}`;
  // WebCrypto signs ECDSA as raw r|s, which is what JWT wants.
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsigned));
  return `vapid t=${unsigned}.${toBase64Url(signature)}, k=${vapid.publicKey}`;
}

/** The browsers' push services; subscriptions anywhere else are refused (see the push_subscriptions check). */
const PUSH_HOSTS =
  /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com)$/;

export function isPushService(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.port && PUSH_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

/** Delivers one message. Returns the push service's status; 404 and 410 mean the browser unsubscribed. */
export async function sendPush(target: PushTarget, message: unknown, vapid: Vapid): Promise<number> {
  const body = await encryptPayload(target, encoder.encode(JSON.stringify(message)));
  const res = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      authorization: await vapidAuthorization(target.endpoint, vapid),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: String(24 * 3600),
      urgency: "normal",
    },
    body,
  });
  return res.status;
}
