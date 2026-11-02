/**
 * Where to send someone after signing in: a path on this site, never another site.
 *
 * Checking the text alone isn't enough: browsers read "/\evil.com" and "/\t/evil.com"
 * as "//evil.com". So the value is resolved the way a browser would, and only kept
 * when it lands on the same origin. Shared by the sign-in pages and /auth/callback.
 */
export function safeNext(next: string | null | undefined, fallback = "/") {
  if (!next || !next.startsWith("/") || /[\\\u0000-\u001f]/.test(next)) return fallback;
  const base = "https://hilltop.invalid";
  try {
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
