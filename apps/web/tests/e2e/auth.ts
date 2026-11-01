import { expect, type Page } from "@playwright/test";

/*
 * End-to-end tests sign in for real against the local Supabase started by
 * `npx supabase start`. Its emails land in Mailpit, where the tests read the code.
 */

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
// The standard key every local Supabase uses; it isn't a secret.
export const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** The students the tests sign in as, and where their sessions are saved. Kofi claims the seeded demo shop. */
export const students = {
  student: { email: "kofi.darko@ashesi.edu.gh", name: "Kofi Darko" },
  buyer: { email: "esi.mensah@ashesi.edu.gh", name: "Esi Mensah" },
} as const;
export type Who = keyof typeof students;
export const stateFile = (who: Who) => `tests/e2e/.auth/${who}.json`;

/** Refuses to run against anything but a local Supabase, so tests never create real accounts. */
export function assertLocal() {
  const host = new URL(supabaseUrl).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`End-to-end tests need a local Supabase, not ${host}. Set NEXT_PUBLIC_SUPABASE_URL to http://127.0.0.1:54321.`);
  }
}

type MailpitList = { messages: { ID: string; Created: string }[] };

/** Waits for a sign-in email sent to `email` after `since` and returns its 6-digit code. */
export async function emailedCode(email: string, since: number): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const list: MailpitList = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=5`).then((r) =>
      r.json(),
    );
    // Mailpit stores times to the millisecond; allow a little clock slack.
    const fresh = list.messages.find((m) => Date.parse(m.Created) >= since - 1000);
    if (fresh) {
      const message: { HTML: string; Text: string } = await fetch(`${mailpitUrl}/api/v1/message/${fresh.ID}`).then((r) => r.json());
      const code = (message.HTML || message.Text).match(/>\s*(\d{6})\s*</)?.[1] ?? message.Text.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No sign-in code reached ${email}`);
}

/** Empties Mailpit, so searches stay fast and don't hold up incoming mail. */
export async function clearMailbox() {
  await fetch(`${mailpitUrl}/api/v1/messages`, { method: "DELETE" });
}

/** Makes sure the account exists, so the sign-in page (which never creates accounts) can send it a code. */
export async function ensureAccount(email: string, name: string) {
  const res = await fetch(`${supabaseUrl}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ email, create_user: true, data: { full_name: name } }),
  });
  if (!res.ok) throw new Error(`Couldn't create ${email}: ${res.status} ${await res.text()}`);
}

/** Types the code from the latest email into the code step. */
export async function enterEmailedCode(page: Page, email: string, since: number) {
  const code = await emailedCode(email, since);
  await expect(page.getByLabel("Digit 1")).toBeVisible();
  await page.getByLabel("Digit 1").fill(code);
}
