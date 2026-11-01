"use client";

import { useEffect, useRef, useState } from "react";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, BadgeCheck, Lock, Loader2, MapPin } from "lucide-react";
// Sample items for the illustration, not live listings.
import { getListing } from "@hilltop/shared/seed";
import { formatCedi } from "@/lib/format";
import { Logo, LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "./ui";

// What Hilltop promises, until real students' words can replace it.
const testimonials = [
  {
    quote: "Only Ashesi students. Every account is checked against a school email.",
    name: "Verified",
    role: "No strangers from group chats",
  },
  {
    quote: "Meet in public spots on campus and pay when you have the item in your hands.",
    name: "Safe meet-ups",
    role: "Library, Cafeteria, Main gate",
  },
  {
    quote: "Your hostel room can be a shop. List in a minute, from your phone.",
    name: "Sell anything",
    role: "Food, fashion, books, gadgets",
  },
];

export type CampusPhoto = {
  src: StaticImageData;
  /** Where on campus it was taken, shown on the photo. */
  place: string;
  /** CSS object-position, to keep the subject in frame when cropped. */
  position?: string;
};

/** Split-screen frame for sign in and sign up, with a photo of the Ashesi campus. */
export function AuthShell({ image, children }: { image: CampusPhoto; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Mobile photo header */}
      <div className="relative h-60 overflow-hidden lg:hidden">
        <Image
          src={image.src}
          alt={`${image.place}, Ashesi University`}
          fill
          priority
          placeholder="blur"
          sizes="100vw"
          style={{ objectPosition: image.position }}
          className="animate-ken-burns object-cover"
        />
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
          <Image
            src={image.src}
            alt={`${image.place}, Ashesi University`}
            fill
            priority
            placeholder="blur"
            sizes="55vw"
            quality={90}
            style={{ objectPosition: image.position }}
            className="animate-ken-burns object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/30" />

          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="absolute top-6 left-6 flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md"
          >
            <MapPin className="size-3.5" aria-hidden />
            {image.place}, Ashesi University
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="absolute top-6 right-6 flex items-center gap-3 rounded-full border border-white/20 bg-white/10 py-1.5 pr-4 pl-1.5 text-sm text-white backdrop-blur-md"
          >
            <BadgeCheck className="ml-1.5 size-4" aria-hidden />
            For Ashesi students only
          </motion.div>

          <FloatingOrder />
          <Testimonials />
        </div>
      </div>
    </div>
  );
}

function FloatingOrder() {
  const l = getListing("wireless-earpods")!;
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
        <Lock className="size-3.5" aria-hidden /> Reserved, pay at pickup
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
            aria-label={`Point ${j + 1}`}
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
/** Ashesi single sign-on. Shown as "coming soon" until the school's identity provider is connected. */
export function MicrosoftButton({ onClick, loading, comingSoon }: { onClick: () => void; loading: boolean; comingSoon?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || comingSoon}
      aria-describedby={comingSoon ? "sso-soon" : undefined}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-line-strong bg-elevated text-[15px] font-medium text-ink-950 transition-colors enabled:hover:border-ink-950 disabled:cursor-not-allowed disabled:opacity-60"
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
      {comingSoon && (
        <span id="sso-soon" className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-500">
          Coming soon
        </span>
      )}
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
