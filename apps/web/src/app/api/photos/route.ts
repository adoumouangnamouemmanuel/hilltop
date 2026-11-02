import { createClient } from "@supabase/supabase-js";
import type { Database } from "@hilltop/shared/database.types";
import { cleanImage } from "@/lib/image-metadata";
import { MAX_PHOTO_BYTES, sniffImage, storePhoto, userFromToken } from "@/lib/photos-server";

/**
 * Uploads one listing photo for the signed-in student. Body: the image bytes.
 *
 * Each upload is recorded in photo_uploads as the student, so the database can cap
 * how many they make (and refuse suspended accounts), and a daily job can remove
 * photos that never ended up on a listing. Metadata is stripped before storing.
 */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;
  const user = await userFromToken(token);
  if (!user) return Response.json({ error: "Sign in to add photos." }, { status: 401 });
  const profileId = (user.app_metadata as { profile_id?: string } | undefined)?.profile_id;
  if (!profileId) return Response.json({ error: "Sign in again to add photos." }, { status: 401 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_PHOTO_BYTES) return Response.json({ error: "That photo is too large." }, { status: 413 });
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > MAX_PHOTO_BYTES) {
    return Response.json({ error: "That photo is too large." }, { status: 413 });
  }
  const type = sniffImage(body.subarray(0, 16));
  if (!type) return Response.json({ error: "Use a JPEG, PNG or WebP photo." }, { status: 415 });
  const cleaned = cleanImage(body, type);
  if (!cleaned) return Response.json({ error: "That photo couldn't be read. Try taking it again." }, { status: 415 });

  const extension = type.split("/")[1].replace("jpeg", "jpg");
  // Grouped by account, so a student's photos can be found or removed together.
  const key = `listings/${user.id}/${crypto.randomUUID()}.${extension}`;

  const asStudent = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    accessToken: async () => token!,
  });
  const recorded = await asStudent.from("photo_uploads").insert({ key, profile_id: profileId, bytes: cleaned.bytes.byteLength });
  if (recorded.error) {
    const limited = recorded.error.code === "23514";
    return Response.json(
      { error: limited ? recorded.error.message : "Couldn't add that photo. Try again." },
      { status: limited ? 429 : 500 },
    );
  }

  const stored = cleaned.bytes.buffer.slice(cleaned.bytes.byteOffset, cleaned.bytes.byteOffset + cleaned.bytes.byteLength) as ArrayBuffer;
  try {
    const url = await storePhoto(key, stored, type, new URL(request.url).origin);
    return Response.json({ url });
  } catch {
    console.error("Photo storage write failed");
    return Response.json({ error: "Your photo couldn't be stored. Try again shortly." }, { status: 503 });
  }
}
