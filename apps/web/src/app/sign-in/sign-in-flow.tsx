"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { emailAllowed } from "@hilltop/shared/config";
import { useConfig } from "@/lib/config";
import { requestCode, schoolSignInAvailable, signInWithSchool, verifyCode } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { MicrosoftButton, OrDivider, OtpInput } from "@/components/auth-shell";
import { buttonClass, cn } from "@/components/ui";

export function safeNext(next: string | null, fallback = "/") {
  return next?.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

export function SignInFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const destination = safeNext(params.get("next"));
  const config = useConfig();
  const domain = config.access.allowedEmailDomains[0];
  const domainList = config.access.allowedEmailDomains.map((d) => `@${d}`).join(" or ");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  // The address the code went to; kept apart from the input, which is still mounted while it animates out.
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "school" ? "School sign-in didn't finish. Try again, or use an email code." : null,
  );
  const [busy, setBusy] = useState<"sso" | "code" | "verify" | null>(null);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!emailAllowed(value, config)) {
      setError(`Use your student email address, ending in ${domainList}`);
      return;
    }
    setError(null);
    setBusy("code");
    const problem = await requestCode(value);
    setBusy(null);
    if (problem) {
      setError(problem);
      return;
    }
    setSentTo(value);
    setStep("code");
  }

  async function verify(code: string) {
    setBusy("verify");
    const problem = await verifyCode(sentTo, code);
    setBusy(null);
    if (problem) return problem;
    toast("Welcome back", { tone: "success" });
    router.push(destination);
    return null;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {step === "email" ? (
        <motion.form
          key="email"
          onSubmit={submitEmail}
          variants={stagger}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0, x: -16 }}
          noValidate
        >
          <motion.h1 variants={item} className="text-[30px] font-semibold tracking-[-0.035em] text-ink-950">
            Welcome back
          </motion.h1>
          <motion.p variants={item} className="mt-2 text-[15px] text-ink-500">
            Log in with your Ashesi account to buy and sell.
          </motion.p>

          {config.access.allowSingleSignOn && (
            <>
              <motion.div variants={item} className="mt-8">
                <MicrosoftButton
                  comingSoon={!schoolSignInAvailable()}
                  loading={busy === "sso"}
                  onClick={async () => {
                    setBusy("sso");
                    const problem = await signInWithSchool(destination);
                    if (problem) {
                      setBusy(null);
                      setError(problem);
                    }
                  }}
                />
              </motion.div>
              <motion.div variants={item}>
                <OrDivider />
              </motion.div>
            </>
          )}

          <motion.div variants={item}>
            <label htmlFor="email" className="block text-sm font-medium text-ink-950">
              Ashesi email
            </label>
            <div
              className={cn(
                "mt-2 flex h-12 items-center gap-2.5 rounded-xl border bg-elevated px-4 transition-colors focus-within:border-ink-950",
                error ? "border-maroon-600" : "border-line-strong hover:border-ink-400",
              )}
            >
              <Mail className="size-4 shrink-0 text-ink-400" aria-hidden />
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder={`firstname.lastname@${domain}`}
                aria-invalid={!!error}
                aria-describedby={error ? "email-error" : undefined}
                className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink-950 outline-none placeholder:text-ink-400"
              />
            </div>
            <AnimatePresence>
              {error && (
                <motion.p
                  id="email-error"
                  role="alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 text-[13px] text-maroon-700"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.div variants={item}>
            <button type="submit" disabled={busy === "code"} className={buttonClass("dark", "lg", "mt-5 w-full")}>
              {busy === "code" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Email me a code"}
            </button>
          </motion.div>

          <motion.p variants={item} className="mt-8 text-center text-sm text-ink-500">
            New to Hilltop?{" "}
            <Link
              href={`/sign-up${params.get("next") ? `?next=${encodeURIComponent(destination)}` : ""}`}
              className="font-medium text-ink-950 underline underline-offset-4"
            >
              Create an account
            </Link>
          </motion.p>
        </motion.form>
      ) : (
        <CodeStep
          key="code"
          email={sentTo}
          busy={busy === "verify"}
          onBack={() => setStep("email")}
          onComplete={verify}
          onResend={() => requestCode(sentTo)}
        />
      )}
    </AnimatePresence>
  );
}

export function CodeStep({
  email,
  busy,
  onBack,
  onComplete,
  onResend,
}: {
  email: string;
  busy: boolean;
  onBack: () => void;
  /** Checks the code; resolves to an error message, or null when it worked. */
  onComplete: (code: string) => Promise<string | null>;
  onResend: () => Promise<string | null>;
}) {
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Remounting the input clears the digits after a wrong code.
  const [attempt, setAttempt] = useState(0);
  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.25 }}>
      <button type="button" onClick={onBack} className="-ml-1 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-950">
        <ArrowLeft className="size-4" aria-hidden /> Back
      </button>
      <motion.span
        initial={{ scale: 0.6, rotate: -10, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
        className="mt-6 grid size-14 place-items-center rounded-2xl bg-surface text-ink-950"
      >
        <Mail className="size-6" aria-hidden />
      </motion.span>
      <h1 className="mt-5 text-[30px] font-semibold tracking-[-0.035em] text-ink-950">Check your inbox</h1>
      <p className="mt-2 text-[15px] leading-6 text-ink-500">
        Enter the 6-digit code we sent to <span className="font-medium text-ink-950">{email}</span>
      </p>
      <div className="mt-8">
        <OtpInput
          key={attempt}
          disabled={busy}
          onComplete={async (code) => {
            setError(null);
            const problem = await onComplete(code);
            if (problem) {
              setError(problem);
              setAttempt((a) => a + 1);
            }
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-maroon-700">
          {error}
        </p>
      )}
      <div className="mt-6 flex h-5 items-center justify-between text-sm text-ink-500">
        {busy ? (
          <span className="flex items-center gap-2 text-ink-950">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Verifying
          </span>
        ) : (
          <span>The code expires in 10 minutes</span>
        )}
        <button
          type="button"
          disabled={resent}
          onClick={async () => {
            setResent(true);
            const problem = await onResend();
            if (problem) {
              setError(problem);
              setResent(false);
            } else toast("New code sent");
          }}
          className="font-medium text-ink-950 underline underline-offset-4 disabled:text-ink-400 disabled:no-underline"
        >
          {resent ? "Code sent" : "Resend code"}
        </button>
      </div>
    </motion.div>
  );
}
