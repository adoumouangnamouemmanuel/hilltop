import { createECDH, createPublicKey, randomBytes, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
// The decryption used by the standard web-push library, to check ours independently.
import ece from "http_ece";
import { encryptPayload, fromBase64Url, toBase64Url, vapidAuthorization } from "@/lib/web-push";

const b64 = (b: Buffer | Uint8Array) => toBase64Url(new Uint8Array(b));

describe("web push", () => {
  it("encrypts so a browser's key can decrypt it (RFC 8291)", async () => {
    const browser = createECDH("prime256v1");
    browser.generateKeys();
    const auth = randomBytes(16);
    const message = JSON.stringify({ title: "New offer", body: "Esi offered GH₵340." });

    const body = await encryptPayload({ p256dh: b64(browser.getPublicKey()), auth: b64(auth) }, new TextEncoder().encode(message));
    const decrypted = ece.decrypt(Buffer.from(body), { version: "aes128gcm", privateKey: browser, authSecret: b64(auth) });
    expect(decrypted.toString("utf8")).toBe(message);
  });

  it("signs a VAPID token the push service can verify (RFC 8292)", async () => {
    const server = createECDH("prime256v1");
    server.generateKeys();
    const vapid = {
      publicKey: b64(server.getPublicKey()),
      privateKey: b64(server.getPrivateKey()),
      subject: "mailto:support@hilltop.lumavok.com",
    };
    const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", vapid, Date.UTC(2026, 10, 2));

    const [, token, key] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(key).toBe(vapid.publicKey);
    const [h, c, s] = token.split(".");
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(c)));
    expect(claims).toMatchObject({ aud: "https://fcm.googleapis.com", sub: vapid.subject });
    expect(claims.exp).toBe(Date.UTC(2026, 10, 2) / 1000 + 12 * 3600);

    const pub = fromBase64Url(vapid.publicKey);
    const jwk = { kty: "EC", crv: "P-256", x: toBase64Url(pub.slice(1, 33)), y: toBase64Url(pub.slice(33)) };
    const ok = verify(
      "sha256",
      Buffer.from(`${h}.${c}`),
      { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" },
      Buffer.from(fromBase64Url(s)),
    );
    expect(ok).toBe(true);
  });
});
