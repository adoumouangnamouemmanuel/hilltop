"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { firstName } from "@/lib/format";
import { emailAllowed } from "@hilltop/shared/config";
import { useConfig } from "@/lib/config";
import { requestCode, schoolSignInAvailable, signInWithSchool, verifyCode } from "@/lib/auth";
import { MicrosoftButton, OrDivider } from "@/components/auth-shell";
import { Confetti } from "@/components/confetti";
import { buttonClass, cn } from "@/components/ui";
import { CodeStep, safeNext } from "../sign-in/sign-in-flow";

const years = [2026, 2027, 2028, 2029, 2030];
const majors = [
  {
    level: "Undergraduate",
    options: [
      "Business Administration",
      "Management Information Systems",
      "Computer Science",
      "Economics",
      "Computer Engineering",
      "Electrical and Electronic Engineering",
      "Mechanical Engineering",
      "Mechatronic Engineering",
      "Biological Engineering",
      "Law with Public Policy",
    ],
  },
  {
    level: "Graduate",
    options: ["Master's in Intelligent Computing Systems", "Master's in Mechatronic Engineering", "MBA"],
  },
];

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

const field =
  "h-12 w-full rounded-xl border bg-elevated px-4 text-[15px] text-ink-950 outline-none transition-colors placeholder:text-ink-400 focus:border-ink-950";

export function SignUpFlow() {
  const router = useRouter();
  const destination = safeNext(useSearchParams().get("next"));
  const config = useConfig();
  const domain = config.access.allowedEmailDomains[0];
  const domainList = config.access.allowedEmailDomains.map((d) => `@${d}`).join(" or ");
  const [step, setStep] = useState<"details" | "code" | "done">("details");
  const ids = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [major, setMajor] = useState("");
  const [agree, setAgree] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<"sso" | "send" | "verify" | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const errors = {
    name: name.trim().split(/\s+/).length < 2 && "Enter your first and last name",
    email: !emailAllowed(email, config) && `Use your ${domainList} email`,
    year: !year && "Pick your class year",
    agree: !agree && "Please agree to the community rules",
  };
  const firstError = Object.values(errors).find(Boolean);
  const show = (k: keyof typeof errors) => touched && errors[k];

  const address = email.trim().toLowerCase();
  const details = { fullName: name.trim(), classOf: year, major };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (firstError) return;
    setSendError(null);
    setBusy("send");
    const problem = await requestCode(address, details);
    setBusy(null);
    if (problem) {
      setSendError(problem);
      return;
    }
    setStep("code");
  }

  async function verify(code: string) {
    setBusy("verify");
    const problem = await verifyCode(address, code);
    setBusy(null);
    if (problem) return problem;
    setStep("done");
    setTimeout(() => router.push(destination), 1800);
    return null;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {step === "details" && (
        <motion.form
          key="details"
          onSubmit={submit}
          variants={stagger}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0, x: -16 }}
          noValidate
        >
          <motion.h1 variants={item} className="text-[30px] font-semibold tracking-[-0.035em] text-ink-950">
            Join Hilltop
          </motion.h1>
          <motion.p variants={item} className="mt-2 text-[15px] text-ink-500">
            Buy and sell with people from your campus. Takes a minute.
          </motion.p>

          {config.access.allowSingleSignOn && (
            <>
              <motion.div variants={item} className="mt-7">
                <MicrosoftButton
                  comingSoon={!schoolSignInAvailable()}
                  loading={busy === "sso"}
                  onClick={async () => {
                    setBusy("sso");
                    const problem = await signInWithSchool(destination);
                    if (problem) {
                      setBusy(null);
                      setSendError(problem);
                    }
                  }}
                />
              </motion.div>
              <motion.div variants={item}>
                <OrDivider />
              </motion.div>
            </>
          )}

          <motion.div variants={item} className="space-y-4">
            <Field label="Full name" htmlFor={`${ids}-name`} error={show("name")}>
              <input
                id={`${ids}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Ama Owusu"
                className={cn(field, show("name") ? "border-maroon-600" : "border-line-strong")}
              />
            </Field>
            <Field label="Ashesi email" htmlFor={`${ids}-email`} error={show("email")}>
              <input
                id={`${ids}-email`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder={`ama.owusu@${domain}`}
                className={cn(field, show("email") ? "border-maroon-600" : "border-line-strong")}
              />
            </Field>
            <Field label="Class of" error={show("year")}>
              <div className="grid grid-cols-5 gap-1.5">
                {years.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setYear(y)}
                    aria-pressed={year === y}
                    className={cn(
                      "relative h-11 rounded-xl border text-sm tabular transition-colors",
                      year === y ? "border-ink-950 text-canvas" : "border-line-strong text-ink-700 hover:border-ink-400",
                    )}
                  >
                    {year === y && (
                      <motion.span
                        layoutId="year-pill"
                        className="absolute inset-0 rounded-[11px] bg-ink-950"
                        transition={{ type: "spring", stiffness: 500, damping: 36 }}
                      />
                    )}
                    <span className="relative">{y}</span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Major (optional)" htmlFor={`${ids}-major`}>
              <div className="relative">
                <select
                  id={`${ids}-major`}
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  className={cn(field, "appearance-none border-line-strong pr-10", !major && "text-ink-400")}
                >
                  <option value="">Choose your major</option>
                  {majors.map((group) => (
                    <optgroup key={group.level} label={group.level}>
                      {group.options.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </optgroup>
                  ))}
                  <option>Other</option>
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
              </div>
            </Field>
            <label className="flex items-start gap-3 pt-1 text-[13px] leading-5 text-ink-500">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="peer sr-only" />
              <span
                className={cn(
                  "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors",
                  agree ? "border-ink-950 bg-ink-950 text-canvas" : show("agree") ? "border-maroon-600" : "border-line-strong",
                )}
              >
                {agree && <Check className="size-3" strokeWidth={3} aria-hidden />}
              </span>
              I&rsquo;ll meet in public spots on campus, describe items honestly and only pay through Hilltop.
            </label>
          </motion.div>

          <motion.div variants={item}>
            {sendError && (
              <p role="alert" className="mt-4 text-[13px] text-maroon-700">
                {sendError}
              </p>
            )}
            <button type="submit" disabled={busy === "send"} className={buttonClass("dark", "lg", "mt-6 w-full")}>
              {busy === "send" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Create account"}
            </button>
          </motion.div>
          <motion.p variants={item} className="mt-6 text-center text-sm text-ink-500">
            Already have an account?{" "}
            <Link href="/sign-in" className="font-medium text-ink-950 underline underline-offset-4">
              Log in
            </Link>
          </motion.p>
        </motion.form>
      )}

      {step === "code" && (
        <CodeStep
          key="code"
          email={address}
          busy={busy === "verify"}
          onBack={() => setStep("details")}
          onComplete={verify}
          onResend={() => requestCode(address, details)}
        />
      )}

      {step === "done" && (
        <motion.div
          key="done"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center py-10 text-center"
        >
          <div className="relative">
            <Confetti count={18} spread={70} />
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 14 }}
              className="relative grid size-20 place-items-center rounded-full bg-success text-white"
            >
              <Check className="size-10" strokeWidth={3} aria-hidden />
            </motion.span>
          </div>
          <h1 className="mt-8 text-[30px] font-semibold tracking-[-0.035em] text-ink-950">You&rsquo;re in, {firstName(name || "there")}</h1>
          <p className="mt-2 text-[15px] text-ink-500">Your student account is verified. Taking you to the market.</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A labelled form row. Pass `htmlFor` for a single input; otherwise the label names the group (e.g. the year buttons). */
function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string | false;
  children: React.ReactNode;
}) {
  const labelId = useId();
  return (
    <div role={htmlFor ? undefined : "group"} aria-labelledby={htmlFor ? undefined : labelId}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label id={labelId} htmlFor={htmlFor} className="text-sm font-medium text-ink-950">
          {label}
        </label>
        <AnimatePresence>
          {error && (
            <motion.span
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-maroon-700"
            >
              {error}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {children}
    </div>
  );
}
