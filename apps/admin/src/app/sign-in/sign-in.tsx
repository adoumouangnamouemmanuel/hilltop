"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, Mail, MapPin, ShieldCheck } from "lucide-react";
import { LogoMark } from "@hilltop/ui/logo";
import { ThemeToggle } from "@hilltop/ui/theme-toggle";
import { buttonClass } from "@hilltop/ui/ui";
import engineeringBuilding from "@/assets/campus/engineering-building.jpg";
import { Field, TextInput } from "@/components/kit";
import { useAdminSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

/** Supabase errors in the portal's words. */
function message(error: { status?: number; code?: string; message?: string } | null, step: "send" | "verify") {
  if (!error) return null;
  const text = error.message ?? "";
  if (step === "verify" && (error.code === "otp_expired" || /expired|invalid/i.test(text)))
    return "That code is wrong or has expired. Check the latest email, or send a new code.";
  if (error.status === 429 || /security purposes/i.test(text)) return "Please wait a minute before asking for another code.";
  if (step === "send" && error.status === 403) return "This email isn't on the admin team. Ask an owner to invite you.";
  return step === "send" ? "We couldn't send a code. Check the address and try again." : "We couldn't verify that code. Try again.";
}

export function SignIn() {
  const router = useRouter();
  const session = useAdminSession();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in as an admin: straight to the portal.
  useEffect(() => {
    if (session.status === "ready") router.replace("/");
  }, [session.status, router]);

  // Arrived already signed in with an account that isn't on the team: sign it out.
  const { status, signOut } = session;
  useEffect(() => {
    if (status === "not-admin") signOut();
  }, [status, signOut]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter your work email address.");
      return;
    }
    const client = supabase();
    if (!client) return setError("Sign-in isn't configured.");
    setBusy(true);
    setError(null);
    const { error: sendError } = await client.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
    setBusy(false);
    if (sendError) return setError(message(sendError, "send"));
    setStep("code");
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    const client = supabase();
    if (!client || code.length !== 6) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await client.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: "email" });
    setBusy(false);
    if (verifyError) {
      setCode("");
      return setError(message(verifyError, "verify"));
    }
    const next = await session.refresh();
    if (next.status === "not-admin") {
      await session.signOut();
      setStep("email");
      setCode("");
      setError(`${next.email} isn't on the admin team. Ask an owner to invite you.`);
    }
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="relative flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LogoMark size={30} />
            <span className="text-[18px] font-semibold tracking-[-0.03em] text-ink-950">hilltop</span>
            <span className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
              Admin
            </span>
          </div>
          <ThemeToggle />
        </div>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <AnimatePresence mode="wait" initial={false}>
            {step === "email" ? (
              <motion.form
                key="email"
                onSubmit={sendCode}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                noValidate
              >
                <span className="grid size-11 place-items-center rounded-2xl bg-maroon-50 text-maroon-700">
                  <ShieldCheck className="size-5" aria-hidden />
                </span>
                <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.035em] text-ink-950">Sign in to the admin portal</h1>
                <p className="mt-2 text-sm text-ink-500">We&rsquo;ll email you a 6-digit code. Only people on the admin team can get in.</p>
                <div className="mt-8 space-y-4">
                  <Field label="Work email" error={error ?? undefined}>
                    {(id) => (
                      <TextInput
                        id={id}
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setError(null);
                        }}
                        placeholder="you@ashesi.edu.gh"
                        aria-invalid={!!error}
                        className="h-12"
                      />
                    )}
                  </Field>
                  <button type="submit" disabled={busy} className={buttonClass("primary", "lg", "w-full")}>
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    Email me a code
                    {!busy && <ArrowRight className="size-4" aria-hidden />}
                  </button>
                </div>
              </motion.form>
            ) : (
              <motion.form
                key="code"
                onSubmit={verify}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.25 }}
                noValidate
              >
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                  }}
                  className="-ml-1 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-950"
                >
                  <ArrowLeft className="size-4" aria-hidden /> Back
                </button>
                <span className="mt-6 grid size-11 place-items-center rounded-2xl bg-surface text-ink-950">
                  <Mail className="size-5" aria-hidden />
                </span>
                <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.035em] text-ink-950">Check your inbox</h1>
                <p className="mt-2 text-sm text-ink-500">
                  Enter the 6-digit code we sent to <span className="font-medium text-ink-950">{email.trim().toLowerCase()}</span>
                </p>
                <div className="mt-8 space-y-4">
                  <Field label="Code" error={error ?? undefined}>
                    {(id) => (
                      <TextInput
                        id={id}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={code}
                        autoFocus
                        onChange={(e) => {
                          setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                          setError(null);
                        }}
                        placeholder="123456"
                        aria-invalid={!!error}
                        className="h-12 text-center text-xl font-semibold tracking-[0.5em] tabular"
                      />
                    )}
                  </Field>
                  <button type="submit" disabled={busy || code.length !== 6} className={buttonClass("primary", "lg", "w-full")}>
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Sign in"}
                  </button>
                  <button type="button" onClick={() => sendCode()} disabled={busy} className={buttonClass("ghost", "sm", "w-full")}>
                    Send a new code
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
        <p className="text-center text-xs text-ink-400">Every action in the portal is recorded in the audit log.</p>
      </div>

      <div className="relative hidden overflow-hidden bg-ink-950 lg:block">
        <Image
          src={engineeringBuilding}
          alt="King Engineering Building, Ashesi University"
          fill
          priority
          placeholder="blur"
          sizes="55vw"
          quality={90}
          className="animate-ken-burns object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#2a0a0f]/95 via-[#2a0a0f]/25 to-black/10" />
        <p className="absolute top-8 left-8 flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
          <MapPin className="size-3.5" aria-hidden />
          King Engineering Building, Ashesi University
        </p>
        <div className="absolute inset-x-0 bottom-0 p-12 text-white">
          <p className="max-w-md text-[30px] leading-tight font-semibold tracking-[-0.035em]">
            Everything the marketplace does, configured from one place.
          </p>
          <div className="mt-8 grid max-w-md grid-cols-3 gap-6 border-t border-white/15 pt-6">
            {[
              ["Fees", "and payments"],
              ["Roles", "with fine permissions"],
              ["Releases", "with rollback"],
            ].map(([a, b]) => (
              <div key={a}>
                <p className="text-[15px] font-semibold">{a}</p>
                <p className="mt-0.5 text-[13px] text-white/65">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
