import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/*
 * The portal's server-side gate. Admin identities and roles are mock data in the
 * browser for now, but anything that changes the live marketplace (publishing)
 * runs on the server and requires the access key from ADMIN_ACCESS_KEY. Without
 * the variable (local development) the gate is open.
 */

export const SESSION_COOKIE = "hilltop_admin";

const digest = (value: string) => createHash("sha256").update(value).digest();

export const accessKeyRequired = () => !!process.env.ADMIN_ACCESS_KEY;

export function keyMatches(key: string) {
  const expected = process.env.ADMIN_ACCESS_KEY;
  if (!expected) return true;
  return timingSafeEqual(digest(key), digest(expected));
}

/** The cookie stores a hash of the key, never the key itself. */
export const sessionToken = (key: string) => digest(`hilltop-admin:${key}`).toString("hex");

export async function hasServerSession() {
  const expected = process.env.ADMIN_ACCESS_KEY;
  if (!expected) return true;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const want = Buffer.from(sessionToken(expected));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}
