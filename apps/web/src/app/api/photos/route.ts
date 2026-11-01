import { MAX_PHOTO_BYTES, sniffImage, storePhoto, userFromToken } from "@/lib/photos-server";

/** Uploads one listing photo for the signed-in student. Body: the image bytes. */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;
  const user = await userFromToken(token);
  if (!user) return Response.json({ error: "Sign in to add photos." }, { status: 401 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_PHOTO_BYTES) return Response.json({ error: "That photo is too large." }, { status: 413 });
  const body = await request.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_PHOTO_BYTES) {
    return Response.json({ error: "That photo is too large." }, { status: 413 });
  }
  const type = sniffImage(new Uint8Array(body.slice(0, 16)));
  if (!type) return Response.json({ error: "Use a JPEG, PNG or WebP photo." }, { status: 415 });

  const extension = type.split("/")[1].replace("jpeg", "jpg");
  // Grouped by account, so a student's photos can be found or removed together.
  const key = `listings/${user.id}/${crypto.randomUUID()}.${extension}`;
  const url = await storePhoto(key, body, type, new URL(request.url).origin);
  return Response.json({ url });
}
