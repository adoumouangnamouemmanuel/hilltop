import { createClient } from "@supabase/supabase-js";
import type { Database } from "@hilltop/shared/database.types";
import { isPushService, sendPush } from "@/lib/web-push";

/*
 * Delivers a notification to the student's browsers. Called by the database (pg_net)
 * when it writes a notification, with only the notification's id. The notification
 * is loaded with the server key and claimed (pushed_at) so each one is sent once, and
 * only if it's fresh, so replaying a request does nothing.
 *
 * Only the database may call it: requests carry the shared secret from
 * private.settings (push_secret) in the x-hilltop-webhook header, which must match
 * the PUSH_WEBHOOK_SECRET Worker secret. Also needs SUPABASE_SECRET_KEY,
 * VAPID_PRIVATE_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY; without them it does nothing.
 */

const FRESH_MS = 5 * 60_000;

/** Compares two strings in constant time, so the secret can't be guessed byte by byte. */
function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function POST(request: Request) {
  const webhookSecret = process.env.PUSH_WEBHOOK_SECRET;
  // Every unauthenticated request gets the same answer, whatever the id.
  const denied = () => Response.json({ error: "unauthorized" }, { status: 401 });
  if (!webhookSecret) return process.env.NODE_ENV === "production" ? denied() : Response.json({ skipped: "not configured" });
  if (!sameSecret(request.headers.get("x-hilltop-webhook") ?? "", webhookSecret)) return denied();

  const secret = process.env.SUPABASE_SECRET_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!secret || !publicKey || !privateKey) return Response.json({ skipped: "not configured" });

  if (Number(request.headers.get("content-length") ?? 0) > 1024) return Response.json({ error: "bad request" }, { status: 400 });
  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "bad request" }, { status: 400 });

  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, { auth: { persistSession: false } });
  const { data: note } = await db
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .eq("id", id)
    .is("pushed_at", null)
    .gt("created_at", new Date(Date.now() - FRESH_MS).toISOString())
    .select("id, profile_id, title, body, href")
    .maybeSingle();
  if (!note) return Response.json({ skipped: "already sent or too old" });

  const { data: subscriptions } = await db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("profile_id", note.profile_id)
    .limit(10);
  const vapid = { publicKey, privateKey, subject: "mailto:support@hilltop.lumavok.com" };
  const message = { title: note.title, body: note.body, href: note.href, tag: note.id };
  const results = await Promise.all(
    (subscriptions ?? []).map(async (s) => {
      // The database only accepts browser push services; this is a second check before any request leaves.
      if (!isPushService(s.endpoint)) return 0;
      const status = await sendPush(s, message, vapid).catch(() => 0);
      // The browser unsubscribed or the subscription expired.
      if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      return status;
    }),
  );
  return Response.json({ sent: results.filter((s) => s >= 200 && s < 300).length });
}
