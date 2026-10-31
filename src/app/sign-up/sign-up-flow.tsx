"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { ASHESI_EMAIL, firstName } from "@/lib/format";
import { useStore } from "@/lib/store";
import { MicrosoftButton, OrDivider } from "@/components/auth-shell";
import { Confetti } from "@/components/confetti";
import { buttonClass, cn } from "@/components/ui";
import { CodeStep, safeNext } from "../sign-in/sign-in-flow";

const years = [2026, 2027, 2028, 2029, 2030];
const majors = [
  "Computer Science",
  "Business Administration",
  "MIS",
  "Economics",
  "Computer Engineering",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Law",
  "Other",
];

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

const field =
  "h-12 w-full rounded-xl border bg-elevated px-4 text-[15px] text-ink-950 outline-none transition-colors placeholder:text-ink-400 focus:border-ink-950";

export function SignUpFlow() {
  const router = useRouter();
  const destination = safeNext(useSearchParams().get("next"));
  const { signIn } = useStore();
  const [step, setStep] = useState<"details" | "code" | "done">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [major, setMajor] = useState("");
  const [agree, setAgree] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<"sso" | "send" | "verify" | null>(null);

  const errors = {
    name: name.trim().split(/\s+/).length < 2 && "Enter your first and last name",
    email: !ASHESI_EMAIL.test(email.trim()) && "Use your @ashesi.edu.gh email",
    year: !year && "Pick your class year",
    agree: !agree && "Please agree to the community rules",
  };
  const firstError = Object.values(errors).find(Boolean);
  const show = (k: keyof typeof errors) => touched && errors[k];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (firstError) return;
    setBusy("send");
    setTimeout(() => {
      setBusy(null);
      setStep("code");
    }, 600);
  }

  function complete(fullName: string, address: string) {
    signIn(address, fullName);
    setStep("done");
    setTimeout(() => router.push(destination), 1800);
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

          <motion.div variants={item} className="mt-7">
            <MicrosoftButton
              loading={busy === "sso"}
              onClick={() => {
                setBusy("sso");
                setTimeout(() => complete("Kofi Darko", "kofi.darko@ashesi.edu.gh"), 900);
              }}
            />
          </motion.div>
          <motion.div variants={item}>
            <OrDivider />
          </motion.div>

          <motion.div variants={item} className="space-y-4">
            <Field label="Full name" error={show("name")}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Ama Owusu"
                className={cn(field, show("name") ? "border-maroon-600" : "border-line-strong")}
              />
            </Field>
            <Field label="Ashesi email" error={show("email")}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="ama.owusu@ashesi.edu.gh"
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
            <Field label="Major (optional)">
              <div className="relative">
                <select
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  className={cn(field, "appearance-none border-line-strong pr-10", !major && "text-ink-400")}
                >
                  <option value="">Choose your major</option>
                  {majors.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
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
          email={email.trim().toLowerCase()}
          busy={busy === "verify"}
          onBack={() => setStep("details")}
          onComplete={() => {
            setBusy("verify");
            setTimeout(() => {
              setBusy(null);
              complete(name, email.trim().toLowerCase());
            }, 900);
          }}
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
          <h1 className="mt-8 text-[30px] font-semibold tracking-[-0.035em] text-ink-950">You&rsquo;re in, {firstName(name || "Kofi")}</h1>
          <p className="mt-2 text-[15px] text-ink-500">Your student account is verified. Taking you to the market.</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, error, children }: { label: string; error?: string | false; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink-950">{label}</span>
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
