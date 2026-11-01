import { readPhoto } from "@/lib/photos-server";

/** Serves photos when there's no public bucket domain (local development and tests). */
export async function GET(_request: Request, { params }: RouteContext<"/api/photos/[...key]">) {
  const { key } = await params;
  const photo = await readPhoto(key.join("/"));
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(photo.body, {
    headers: { "content-type": photo.type, "cache-control": "public, max-age=31536000, immutable" },
  });
}
