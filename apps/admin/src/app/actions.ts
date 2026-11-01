"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { publish } from "@/lib/config-store";
import { accessKeyRequired, hasServerSession, keyMatches, SESSION_COOKIE, sessionToken } from "@/lib/session";

export async function startSession(key: string): Promise<{ ok: boolean; error?: string }> {
  if (!accessKeyRequired()) return { ok: true };
  if (!key || !keyMatches(key)) return { ok: false, error: "That access key isn't right." };
  (await cookies()).set(SESSION_COOKIE, sessionToken(key), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return { ok: true };
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

const publishInput = z.object({
  config: z.unknown(),
  by: z.string().min(1).max(80),
  note: z.string().max(280),
});

export type PublishResult =
  { ok: true; version: number; publishedAt: string; changes: string[] } | { ok: false; error: string; issues?: string[] };

export async function publishConfig(input: z.infer<typeof publishInput>): Promise<PublishResult> {
  if (!(await hasServerSession())) return { ok: false, error: "Your session has expired. Sign in again to publish." };
  const parsed = publishInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const release = await publish(parsed.data.config, parsed.data.by, parsed.data.note);
    return { ok: true, version: release.version, publishedAt: release.publishedAt, changes: release.changes };
  } catch (e) {
    if (e instanceof z.ZodError)
      return { ok: false, error: "Some settings aren't valid.", issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    return { ok: false, error: "Publishing failed. Try again." };
  }
}
