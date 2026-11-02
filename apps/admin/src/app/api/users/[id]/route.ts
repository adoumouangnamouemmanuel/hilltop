import { createClient } from "@supabase/supabase-js";
import type { Database } from "@hilltop/shared/database.types";

/*
 * Deletes a student and everything that's theirs. Needs the Supabase secret key (the
 * SUPABASE_SECRET_KEY Worker secret), so it runs here on the server, and only for
 * admins whose role has users.delete.
 *
 * Deleting the profile cascades in the database to their listings and photos,
 * conversations and messages, offers, reviews, reports, saved items and searches,
 * notifications and email. Their photos are removed from R2 and their sign-in from
 * Supabase Auth. Records are kept: orders keep both names (copied when placed) and
 * the audit log is never rewritten. Each step can be repeated, so if one fails,
 * deleting again finishes the job.
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

  // Who's deleting, for the audit log (written here, with the server key, since the browser can't).
  const { data: caller } = await server.auth.getUser(token);
  const { data: actor } = caller.user
    ? await server.from("profiles").select("name, admin_members(name)").eq("user_id", caller.user.id).maybeSingle()
    : { data: null };
  const membership = actor?.admin_members as { name: string } | { name: string }[] | null | undefined;
  const actorName = (Array.isArray(membership) ? membership[0]?.name : membership?.name) ?? actor?.name ?? "Admin";

  // The sign-in goes first: if that fails nothing else has changed, and if a later
  // step fails the account can't sign in and running this again finishes the job.
  if (profile.user_id) {
    const { error } = await server.auth.admin.deleteUser(profile.user_id);
    if (error && !/not found/i.test(error.message))
      return fail(500, `Couldn't delete their sign-in, so nothing was changed: ${error.message}`);
  }

  // Photos: everything under the account's folder, plus any recorded upload (which
  // still finds them on a retry, after the sign-in id is gone).
  const bucket = await photoBucket();
  if (bucket) {
    if (profile.user_id) {
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix: `listings/${profile.user_id}/`, cursor });
        if (page.objects.length) await bucket.delete(page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
    }
    const { data: uploads } = await server.from("photo_uploads").select("key").eq("profile_id", id);
    for (let i = 0; uploads && i < uploads.length; i += 500) await bucket.delete(uploads.slice(i, i + 500).map((u) => u.key));
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
  if (removed.error) return fail(500, `Their sign-in is gone but their data isn't yet. Try again: ${removed.error.message}`);

  await server
    .from("audit_log")
    .insert({ permission: "users.delete", action: "Deleted account and data", target: profile.name, actor_name: actorName });

  return Response.json({ deleted: profile.name });
}
