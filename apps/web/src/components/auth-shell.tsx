"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Lock, Loader2 } from "lucide-react";
import { getListing } from "@/lib/data";
import { formatCedi } from "@/lib/format";
import { Logo, LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { Avatar, cn } from "./ui";

const testimonials = [
  { quote: "Sold my fridge in three hours and got paid the moment she picked it up.", name: "Nana A.", role: "Economics, class of 2026" },
  { quote: "Finally no more sending MoMo to strangers in WhatsApp groups.", name: "Kojo A.", role: "Computer Science, class of 2027" },
  { quote: "I sell cookies every morning. Hilltop is basically my shopfront.", name: "Abena O.", role: "Business, class of 2027" },
];

/** Split-screen frame for sign in and sign up, with an editorial photo panel. */
export function AuthShell({ image, children }: { image: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Mobile photo header */}
      <div className="relative h-60 overflow-hidden lg:hidden">
        <Image src={image} alt="" fill priority sizes="100vw" className="animate-ken-burns object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/60" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <Link
            href="/"
            className="grid size-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur"
            aria-label="Back to Hilltop"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <LogoMark size={34} />
          <ThemeToggle className="bg-white/15 text-white hover:bg-white/25 hover:text-white" />
        </div>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="absolute inset-x-5 bottom-12 text-lg leading-snug font-semibold text-white"
        >
          The campus marketplace, built on trust.
        </motion.p>
      </div>

      {/* Form column */}
      <div className="relative -mt-7 flex min-h-[calc(100dvh-13rem)] flex-col rounded-t-[1.75rem] bg-canvas px-5 pt-8 pb-8 lg:mt-0 lg:min-h-dvh lg:rounded-none lg:px-12 lg:pt-8 xl:px-20">
        <div className="hidden items-center justify-between lg:flex">
          <Logo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/" className="text-sm text-ink-500 hover:text-ink-950">
              Back to market
            </Link>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center lg:py-12">{children}</div>
        <p className="mx-auto max-w-[400px] text-center text-xs leading-5 text-ink-400">
          A student project for Ashesi University. Your email is only used to verify you&rsquo;re a student.
        </p>
      </div>

      {/* Desktop photo panel */}
      <div className="relative hidden p-3 lg:block">
        <div className="sticky top-3 h-[calc(100dvh-1.5rem)] overflow-hidden rounded-[2rem] bg-ink-950">
          <Image src={image} alt="" fill priority sizes="55vw" quality={90} className="animate-ken-burns object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/30" />

          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="absolute top-6 right-6 flex items-center gap-3 rounded-full border border-white/20 bg-white/10 py-1.5 pr-4 pl-1.5 text-sm text-white backdrop-blur-md"
          >
            <span className="flex -space-x-2">
              {["Ama O", "Kojo A", "Esi B", "Yaw B"].map((n) => (
                <span key={n} className="rounded-full ring-2 ring-black/20">
                  <Avatar name={n} size={28} />
                </span>
              ))}
            </span>
            2,400+ verified students
          </motion.div>

          <FloatingOrder />
          <Testimonials />
        </div>
      </div>
    </div>
  );
}

function FloatingOrder() {
  const l = getListing("airpods-pro")!;
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0, y: [0, -8, 0] }}
      transition={{
        opacity: { delay: 0.6 },
        x: { delay: 0.6, type: "spring", stiffness: 120 },
        y: { duration: 6, repeat: Infinity, ease: "easeInOut" },
      }}
      className="absolute top-[28%] left-8 w-64 rounded-2xl border border-white/20 bg-white/10 p-3 text-white shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-center gap-3">
        <span className="relative size-12 shrink-0 overflow-hidden rounded-xl">
          <Image src={l.images[0]} alt="" fill sizes="48px" className="object-cover" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{l.title}</p>
          <p className="text-xs text-white/70">{formatCedi(l.price)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-xs">
        <Lock className="size-3.5" aria-hidden /> Payment held until pickup
      </div>
    </motion.div>
  );
}

function Testimonials() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % testimonials.length), 5500);
    return () => clearInterval(id);
  }, []);
  const t = testimonials[i];
  return (
    <div className="absolute inset-x-6 bottom-6 rounded-3xl border border-white/15 bg-black/25 p-7 text-white backdrop-blur-xl">
      <AnimatePresence mode="wait">
        <motion.figure
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.4 }}
        >
          <blockquote className="text-xl leading-snug font-medium tracking-[-0.01em]">&ldquo;{t.quote}&rdquo;</blockquote>
          <figcaption className="mt-5 flex items-center gap-3">
            <Avatar name={t.name} size={36} />
            <span>
              <span className="block text-sm font-semibold">{t.name}</span>
              <span className="text-xs text-white/65">{t.role}</span>
            </span>
          </figcaption>
        </motion.figure>
      </AnimatePresence>
      <div className="mt-6 flex gap-1.5">
        {testimonials.map((_, j) => (
          <button
            key={j}
            type="button"
            onClick={() => setI(j)}
            aria-label={`Testimonial ${j + 1}`}
            className="h-1 flex-1 overflow-hidden rounded-full bg-white/20"
          >
            {j === i && (
              <motion.span
                key={i}
                className="block h-full bg-white"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 5.5, ease: "linear" }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Microsoft-style single sign-on button. Ashesi accounts live on Microsoft 365. */
export function MicrosoftButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-line-strong bg-elevated text-[15px] font-medium text-ink-950 transition-colors hover:border-ink-950 disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <svg viewBox="0 0 21 21" className="size-[18px]" aria-hidden>
          <rect x="1" y="1" width="9" height="9" fill="#f25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
          <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
      )}
      Continue with Ashesi Microsoft
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-ink-400">
      <span className="h-px flex-1 bg-line" /> or use a code <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Six-box one-time code input. Supports paste and backspace navigation. */
export function OtpInput({ onComplete, disabled }: { onComplete: (code: string) => void; disabled?: boolean }) {
  const [code, setCode] = useState<string[]>(Array(6).fill(""));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  function setDigit(i: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setCode((c) => c.map((d, j) => (j === i ? "" : d)));
      return;
    }
    const next = [...code];
    digits
      .slice(0, 6 - i)
      .split("")
      .forEach((d, k) => (next[i + k] = d));
    setCode(next);
    inputs.current[Math.min(i + digits.length, 5)]?.focus();
    if (next.every(Boolean)) onComplete(next.join(""));
  }

  return (
    <fieldset className="grid grid-cols-6 gap-2" disabled={disabled}>
      <legend className="sr-only">Verification code</legend>
      {code.map((d, i) => (
        <motion.input
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          value={d}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d && i > 0) inputs.current[i - 1]?.focus();
          }}
          inputMode="numeric"
          autoFocus={i === 0}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          className={cn(
            "h-14 w-full min-w-0 rounded-xl border bg-elevated text-center text-xl font-semibold text-ink-950 tabular transition-colors outline-none focus:border-ink-950",
            d ? "border-ink-950" : "border-line-strong",
          )}
        />
      ))}
    </fieldset>
  );
}
