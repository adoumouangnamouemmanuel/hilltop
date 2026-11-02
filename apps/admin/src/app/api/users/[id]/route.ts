import { createClient } from "@supabase/supabase-js";
import type { Database } from "@hilltop/shared/database.types";

/*
 * Deletes a student and everything that's theirs. Needs the Supabase secret key (the
 * SUPABASE_SECRET_KEY Worker secret), so it runs here on the server, and only for
 * admins whose role has users.delete.
 *
 * Deleting the profile cascades in the database to their listings and photos,
 * conversations and messages, offers, reviews, reports, saved items and searches,
 * notifications and email. Their photos are removed from R2, their sign-in from
 * Supabase Auth, and their name from the audit log. Orders stay for the other
 * student, shown as with a deleted student.
 */

type PhotoBucket = {
  list(options: { prefix: string; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
  delete(keys: string[]): Promise<void>;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const fail = (status: number, error: string) => Response.json({ error }, { status });

async function photoBucket(): Promise<PhotoBucket | undefined> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return (env as unknown as { PHOTOS?: PhotoBucket }).PHOTOS;
  } catch {
    return undefined;
  }
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/users/[id]">) {
  const { id } = await params;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return fail(503, "Deleting accounts isn't set up yet: add the SUPABASE_SECRET_KEY secret to the admin Worker.");

  // Who's asking, with their own session: the database answers for their role.
  const token = request.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!token) return fail(401, "Sign in again.");
  const asAdmin = createClient<Database>(url, publishable, { accessToken: async () => token });
  const { data: permissions } = await asAdmin.rpc("my_permissions");
  // Owners hold every permission, which the database reports as "*".
  if (!permissions?.some((p) => p === "*" || p === "users.delete")) return fail(403, "You don't have permission to delete accounts.");

  const server = createClient<Database>(url, secret, { auth: { persistSession: false } });
  const { data: profile } = await server.from("profiles").select("id, user_id, name").eq("id", id).maybeSingle();
  if (!profile) return fail(404, "That student doesn't exist.");
  const { data: member } = await server.from("admin_members").select("id").eq("profile_id", id).maybeSingle();
  if (member) return fail(409, "Remove them from the admin team first.");

  // Photos are stored under the account id (see the marketplace's /api/photos).
  if (profile.user_id) {
    const bucket = await photoBucket();
    if (bucket) {
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix: `listings/${profile.user_id}/`, cursor });
        if (page.objects.length) await bucket.delete(page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
    }
  }

  // Other people's notifications about chats with them quote their messages.
  const { data: chats } = await server.from("conversations").select("id").or(`buyer_id.eq.${id},seller_id.eq.${id}`);
  if (chats?.length)
    await server
      .from("notifications")
      .delete()
      .in(
        "href",
        chats.map((c) => `/inbox?c=${c.id}`),
      );

  const removed = await server.from("profiles").delete().eq("id", id);
  if (removed.error) return fail(500, `Couldn't delete their data: ${removed.error.message}`);

  if (profile.user_id) {
    const { error } = await server.auth.admin.deleteUser(profile.user_id);
    if (error) return fail(500, `Their data is gone, but the sign-in couldn't be deleted: ${error.message}`);
  }

  // Earlier entries that named them keep what happened, without who it was about.
  await server.from("audit_log").update({ target: "Deleted student" }).eq("target", profile.name);

  return Response.json({ deleted: profile.name });
}
