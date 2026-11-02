import { readPhoto } from "@/lib/photos-server";

/**
 * Serves photos when there's no public bucket domain (local development and tests).
 * In production photos come from the bucket's own domain, so this answers 404 there
 * and can't become a second, unrestricted way to read the bucket.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/photos/[...key]">) {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(request.url).hostname);
  if (!local && process.env.NODE_ENV === "production" && process.env.ALLOW_PHOTO_FALLBACK !== "1") {
    return new Response("Not found", { status: 404 });
  }
  const { key } = await params;
  const path = key.join("/");
  if (!/^listings\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path)) return new Response("Not found", { status: 404 });
  const photo = await readPhoto(path);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(photo.body, {
    headers: {
      "content-type": photo.type,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
