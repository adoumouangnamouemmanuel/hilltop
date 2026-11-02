import { createClient } from "@supabase/supabase-js";

/*
 * Listing photos. In production they're written to the hilltop-photos R2 bucket
 * through the Worker's PHOTOS binding and served from PHOTOS_URL (the bucket's
 * custom domain), so no storage keys exist anywhere. Without the binding (next dev
 * without Wrangler, next start in tests) they're kept in memory and served by
 * /api/photos, which is enough to try the sell flow locally.
 */

type StoredPhoto = { body: ArrayBuffer; type: string };
type PhotoBucket = {
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string; cacheControl: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
};

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

const memory = new Map<string, StoredPhoto>();

async function cloudflare(): Promise<{ bucket?: PhotoBucket; publicUrl?: string }> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const vars = env as unknown as { PHOTOS?: PhotoBucket; PHOTOS_URL?: string };
    return { bucket: vars.PHOTOS, publicUrl: vars.PHOTOS_URL };
  } catch {
    return {};
  }
}

/** The image type from the file's first bytes; the browser's claim isn't trusted. */
export function sniffImage(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** The signed-in student behind a Supabase access token, or null. */
export async function userFromToken(token: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return null;
  const { data } = await createClient(url, key, { auth: { persistSession: false } }).auth.getUser(token);
  return data.user ?? null;
}

/** Stores a photo and returns its public URL. */
export async function storePhoto(key: string, body: ArrayBuffer, type: string, origin: string): Promise<string> {
  const { bucket, publicUrl } = await cloudflare();
  if (bucket) {
    // Keys are random and never reused, so photos can be cached for good.
    await bucket.put(key, body, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
    // Locally the bucket is Wrangler's on-disk copy, which only this app can serve.
    const local = /^(localhost|127\.0\.0\.1)$/.test(new URL(origin).hostname);
    return publicUrl && !local ? `${publicUrl}/${key}` : `${origin}/api/photos/${key}`;
  }
  if (
    process.env.NODE_ENV === "production" &&
    !(process.env.ALLOW_MEMORY_PHOTOS === "true" && /^(localhost|127\.0\.0\.1)$/.test(new URL(origin).hostname))
  ) {
    console.error("Photo storage binding PHOTOS is unavailable");
    throw new Error("Photo storage is temporarily unavailable. Try again shortly.");
  }
  memory.set(key, { body, type });
  return `${origin}/api/photos/${key}`;
}

export async function readPhoto(key: string): Promise<StoredPhoto | null> {
  const { bucket } = await cloudflare();
  if (bucket) {
    const object = await bucket.get(key);
    return object ? { body: await object.arrayBuffer(), type: object.httpMetadata?.contentType ?? "image/jpeg" } : null;
  }
  return memory.get(key) ?? null;
}
