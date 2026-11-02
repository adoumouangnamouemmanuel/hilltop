/*
 * Cloudflare Access in front of the admin portal, checked a second time by the Worker.
 *
 * Access signs every request it lets through with a JWT (the Cf-Access-Jwt-Assertion
 * header). When CF_ACCESS_TEAM_DOMAIN (e.g. "hilltop.cloudflareaccess.com") and
 * CF_ACCESS_AUD (the Access application's audience tag) are set, any request without
 * a valid token for this application is refused, so the portal stays closed even if
 * the Access application is deleted or its policy is loosened by mistake. Without
 * those variables the check is off (local development and previews).
 */

type Jwk = JsonWebKey & { kid: string };

let keys: { at: number; byKid: Map<string, CryptoKey> } | null = null;

function base64UrlBytes(value: string) {
  const bin = atob(
    value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "="),
  );
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function signingKeys(team: string) {
  // Access rotates its keys; an hour-old copy is fine, and an unknown kid triggers a refresh.
  if (keys && Date.now() - keys.at < 3_600_000) return keys.byKid;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs ${res.status}`);
  const { keys: jwks } = (await res.json()) as { keys: Jwk[] };
  const byKid = new Map<string, CryptoKey>();
  for (const jwk of jwks) {
    byKid.set(jwk.kid, await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
  }
  keys = { at: Date.now(), byKid };
  return byKid;
}

/** Whether the request carries a valid Access token for this application. */
export async function accessAllows(request: Request, team: string, audience: string, now = Date.now()) {
  const token = request.headers.get("cf-access-jwt-assertion");
  const parts = token?.split(".");
  if (!parts || parts.length !== 3) return false;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlBytes(parts[0]))) as { alg?: string; kid?: string };
    const claims = JSON.parse(new TextDecoder().decode(base64UrlBytes(parts[1]))) as {
      aud?: string | string[];
      exp?: number;
      nbf?: number;
      iss?: string;
    };
    if (header.alg !== "RS256" || !header.kid) return false;
    let key = (await signingKeys(team)).get(header.kid);
    if (!key) {
      keys = null;
      key = (await signingKeys(team)).get(header.kid);
    }
    if (!key) return false;
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlBytes(parts[2]), signed))) return false;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const seconds = now / 1000;
    return (
      audiences.includes(audience) &&
      claims.iss === `https://${team}` &&
      typeof claims.exp === "number" &&
      claims.exp > seconds &&
      (claims.nbf === undefined || claims.nbf <= seconds + 60)
    );
  } catch {
    return false;
  }
}
