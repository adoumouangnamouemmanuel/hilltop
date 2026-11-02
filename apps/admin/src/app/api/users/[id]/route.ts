import { createClient } from "@supabase/supabase-js";
import type { Database } from "@hilltop/shared/database.types";

/*
 * Deletes a student's account. Needs the Supabase secret key (the SUPABASE_SECRET_KEY
 * Worker secret), so it runs here on the server, and only for admins whose role has
 * users.delete. What's removed: the sign-in account, the student's email, saved items,
 * searches and notifications, their photos, and their listings (taken down). Their
 * profile stays as "Deleted student" so other people's orders, messages and reviews
 * still make sense.
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

  const steps = await Promise.all([
    server.from("listings").update({ status: "removed" }).eq("seller_id", id).neq("status", "removed"),
    // Offers still waiting for an answer go; answered ones stay with the seller's history.
    server.from("offers").delete().eq("buyer_id", id).eq("status", "pending"),
    server.from("saved_listings").delete().eq("profile_id", id),
    server.from("saved_searches").delete().eq("profile_id", id),
    server.from("notifications").delete().eq("profile_id", id),
    server.from("profile_emails").delete().eq("profile_id", id),
  ]);
  const stepError = steps.find((s) => s.error)?.error;
  if (stepError) return fail(500, `Couldn't remove their data: ${stepError.message}`);

  const anonymised = await server
    .from("profiles")
    .update({
      name: "Deleted student",
      shop_name: null,
      specialty: null,
      class_of: null,
      major: null,
      response_time: null,
      verified: false,
      status: "suspended",
      claim_email: null,
    })
    .eq("id", id);
  if (anonymised.error) return fail(500, `Couldn't anonymise the profile: ${anonymised.error.message}`);

  if (profile.user_id) {
    // Photos are stored under the account id (see the marketplace's /api/photos).
    const bucket = await photoBucket();
    if (bucket) {
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix: `listings/${profile.user_id}/`, cursor });
        if (page.objects.length) await bucket.delete(page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
    }
    const { error } = await server.auth.admin.deleteUser(profile.user_id);
    if (error) return fail(500, `Couldn't delete the sign-in account: ${error.message}`);
  }
  return Response.json({ deleted: profile.name });
}
