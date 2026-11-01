"use client";

import type { AuthError, User as AuthUser } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { User } from "./types";

/*
 * Sign-in with a 6-digit email code (Supabase Auth). Which email domains may
 * sign up is enforced by the database's sign-up hook, not only here.
 */

export type SignUpDetails = { fullName: string; classOf?: number | null; major?: string };

const notConfigured = "Sign-in isn't available right now. Please try again later.";

/** Supabase's messages, in the words we use with students. */
export function authMessage(error: AuthError | Error | null | undefined, step: "send" | "verify") {
  if (!error) return null;
  const status = "status" in error ? error.status : undefined;
  const code = "code" in error ? error.code : undefined;
  const text = error.message ?? "";
  if (code === "otp_disabled" || /signups not allowed/i.test(text)) return "There's no account with this email yet. Create one instead.";
  if (step === "verify" && (code === "otp_expired" || /expired|invalid/i.test(text)))
    return "That code is wrong or has expired. Check the latest email, or send a new code.";
  if (status === 429 || code === "over_email_send_rate_limit" || /security purposes/i.test(text))
    return "Please wait a minute before asking for another code.";
  // The sign-up hook's refusal, already written for students.
  if (step === "send" && status === 403 && text) return text;
  return step === "send" ? "We couldn't send a code. Check the address and try again." : "We couldn't verify that code. Try again.";
}

/** Emails a sign-in code. New accounts are only created from the sign-up page. */
export async function requestCode(email: string, signUp?: SignUpDetails) {
  const client = supabase();
  if (!client) return notConfigured;
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: !!signUp,
      data: signUp ? { full_name: signUp.fullName, class_of: signUp.classOf ?? undefined, major: signUp.major || undefined } : undefined,
    },
  });
  return authMessage(error, "send");
}

export async function verifyCode(email: string, token: string) {
  const client = supabase();
  if (!client) return notConfigured;
  const { error } = await client.auth.verifyOtp({ email, token, type: "email" });
  return authMessage(error, "verify");
}

export async function signOutEverywhere() {
  await supabase()?.auth.signOut();
}

/** The app's view of a signed-in person. */
export function toUser(user: AuthUser | null | undefined): User | null {
  if (!user?.email) return null;
  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    user.email
      .split("@")[0]
      .split(/[._]/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  const app = user.app_metadata ?? {};
  return {
    name,
    email: user.email,
    profileId: typeof app.profile_id === "string" ? app.profile_id : undefined,
    handle: typeof app.handle === "string" ? app.handle : undefined,
  };
}

/** Signs in with the school's identity provider when one is set up (e.g. "azure" for Microsoft). */
export async function signInWithSchool(next: string) {
  const client = supabase();
  const provider = process.env.NEXT_PUBLIC_SSO_PROVIDER as "azure" | "google" | undefined;
  if (!client || !provider) return notConfigured;
  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  return error ? "We couldn't reach your school's sign-in. Try the email code instead." : null;
}

export const schoolSignInAvailable = () => !!process.env.NEXT_PUBLIC_SSO_PROVIDER;
