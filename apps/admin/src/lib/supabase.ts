"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@hilltop/shared/database.types";

/*
 * The Supabase client in the browser. It keeps the session in cookies and
 * refreshes it on its own, so the app needs no request proxy (which Cloudflare
 * Workers don't support for Next.js 16).
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** The shared client, or null when Supabase isn't configured (e.g. in unit tests). */
export function supabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return (client ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_KEY));
}
