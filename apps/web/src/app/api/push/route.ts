import { createClient } from "@supabase/supabase-js";
import type { Database } from "@hilltop/shared/database.types";
import { isPushService, deliverPush } from "@/lib/web-push";

/*
 * Delivers a notification to the student's browsers. Called by the database (pg_net)
 * when it writes a notification, and by the minute scheduler for retries. Each
 * per-device job has an expiring lease. Provider acceptance is recorded only after
 * sending. A crash can cause a retry; the notification tag deduplicates its display.
 *
 * Only the database may call it: requests carry the shared secret from
 * private.settings (push_secret) in the x-hilltop-webhook header, which must match
 * the PUSH_WEBHOOK_SECRET Worker secret. Also needs SUPABASE_SECRET_KEY,
 * VAPID_PRIVATE_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY; missing config returns 503.
 */

type Delivery = {
  id: string;
  lease: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  body: string;
  href: string;
  tag: string;
};

/** Public capability flag only: never exposes credentials or subscription data. */
export async function GET() {
  const available = !!(
    process.env.PUSH_WEBHOOK_SECRET &&
    process.env.SUPABASE_SECRET_KEY &&
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY
  );
  return Response.json({ available }, { headers: { "cache-control": "no-store" } });
}

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
  if (!secret || !publicKey || !privateKey) return Response.json({ error: "Push delivery is not configured" }, { status: 503 });

  if (Number(request.headers.get("content-length") ?? 0) > 1024) return Response.json({ error: "bad request" }, { status: 400 });
  const payload: unknown = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return Response.json({ error: "bad request" }, { status: 400 });
  const id = "id" in payload ? payload.id : undefined;
  if (id !== undefined && (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)))
    return Response.json({ error: "bad request" }, { status: 400 });
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, { auth: { persistSession: false } });
  const claimed = await db.rpc("claim_push_deliveries", { p_notification: typeof id === "string" ? id : undefined });
  if (claimed.error) {
    console.error("Push jobs could not be claimed", claimed.error.code);
    return Response.json({ error: "Delivery temporarily unavailable" }, { status: 503 });
  }
  const jobs = claimed.data as unknown as Delivery[];
  const vapid = { publicKey, privateKey, subject: "mailto:support@hilltop.lumavok.com" };
  // Bounded concurrency keeps delivery within the database lease and Worker limits.
  let sent = 0;
  let failed = 0;
  for (let offset = 0; offset < jobs.length; offset += 5) {
    await Promise.all(
      jobs.slice(offset, offset + 5).map(async (job) => {
        const outcome = isPushService(job.endpoint)
          ? await deliverPush(job, { title: job.title, body: job.body, href: job.href, tag: job.tag }, vapid).catch(() => ({
              status: 0,
              retrySeconds: 0,
            }))
          : { status: 400, retrySeconds: 0 };
        const result = await db.rpc("finish_push_delivery", {
          p_id: job.id,
          p_lease: job.lease,
          p_status: outcome.status,
          p_retry_seconds: outcome.retrySeconds,
        });
        if (result.error) {
          failed++;
          console.error("Push delivery acknowledgement failed", result.error.code);
        } else if (outcome.status >= 200 && outcome.status < 300) sent++;
        else failed++;
      }),
    );
  }
  if (failed) console.error("Push delivery attempts failed", { count: failed });
  return Response.json({ sent, failed, claimed: jobs.length });
}
