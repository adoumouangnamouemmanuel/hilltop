"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Lock, MapPin, Search, Star } from "lucide-react";
import { getListing } from "@/lib/data";
import { formatCedi } from "@/lib/format";
import { Confetti } from "./confetti";
import { cn } from "./ui";

const STEP_MS = 3600;

const steps = [
  { title: "Find it", caption: "Search listings from verified students" },
  { title: "Pay safely", caption: "Protected payments are held, not sent" },
  { title: "Meet on campus", caption: "Collect at a public spot" },
  { title: "Confirm, done", caption: "Seller is paid when you confirm" },
];

/** Animated walkthrough: a phone that plays the buying flow, with clickable steps. */
export function HowItWorks({ className }: { className?: string }) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (paused || reduce) return;
    const id = setTimeout(() => setStep((s) => (s + 1) % steps.length), STEP_MS);
    return () => clearTimeout(id);
  }, [step, paused, reduce]);

  return (
    <div
      className={cn("flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:gap-10", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Phone step={step} />
      <ol className="grid w-full max-w-sm grid-cols-4 gap-2 lg:w-56 lg:grid-cols-1 lg:gap-1">
        {steps.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                "group w-full rounded-xl text-left transition-colors lg:px-3 lg:py-2.5",
                i === step ? "lg:bg-surface" : "lg:hover:bg-surface/60",
              )}
              aria-current={i === step}
            >
              <span className="block h-1 overflow-hidden rounded-full bg-line">
                {i === step ? (
                  <motion.span
                    key={`${step}-${paused}`}
                    className="block h-full rounded-full bg-ink-950"
                    initial={{ width: paused || reduce ? "100%" : "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: paused || reduce ? 0 : STEP_MS / 1000, ease: "linear" }}
                  />
                ) : (
                  <span className={cn("block h-full rounded-full", i < step ? "w-full bg-ink-400" : "w-0")} />
                )}
              </span>
              <span className={cn("mt-2 block text-[11px] font-semibold sm:text-[13px]", i === step ? "text-ink-950" : "text-ink-400")}>
                {s.title}
              </span>
              <span className="hidden text-xs leading-5 text-ink-500 lg:block">{s.caption}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Phone({ step }: { step: number }) {
  return (
    <div className="relative">
      <div className="absolute -inset-8 -z-10 rounded-full bg-maroon-700/10 blur-3xl dark:bg-maroon-700/20" aria-hidden />
      <div className="relative h-[480px] w-[240px] overflow-hidden rounded-[2.6rem] border-[9px] border-[#141212] bg-canvas shadow-pop sm:h-[520px] sm:w-[260px] dark:outline dark:outline-1 dark:outline-white/15">
        <div className="absolute top-2 left-1/2 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-[#141212]" />
        <div className="flex h-9 items-end justify-between px-6 pb-1 text-[10px] font-semibold text-ink-950">
          <span>9:41</span>
          <span className="flex gap-0.5">
            <span className="h-2 w-3 rounded-sm bg-ink-950" />
          </span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 top-9 bottom-0 px-3.5 pt-2"
          >
            {step === 0 && <FindScreen />}
            {step === 1 && <PayScreen />}
            {step === 2 && <MeetScreen />}
            {step === 3 && <DoneScreen />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

const casio = getListing("casio-fx991")!;
const picks = ["casio-fx991", "headphones", "beaded-bracelets", "chapati"].map((id) => getListing(id)!);

function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) return;
    const id = setTimeout(() => setN((x) => x + 1), 110);
    return () => clearTimeout(id);
  }, [n, text]);
  return (
    <span>
      {text.slice(0, n)}
      <motion.span
        className="ml-px inline-block h-3 w-px bg-ink-950 align-middle"
        animate={{ opacity: [1, 0] }}
        transition={{ repeat: Infinity, duration: 0.6 }}
      />
    </span>
  );
}

function FindScreen() {
  return (
    <div>
      <p className="text-base font-semibold tracking-tight text-ink-950">Discover</p>
      <div className="mt-2 flex h-8 items-center gap-1.5 rounded-lg bg-surface px-2.5 text-[11px] text-ink-950">
        <Search className="size-3 text-ink-500" aria-hidden />
        <Typewriter text="calculator" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {picks.map((l, i) => (
          <motion.div key={l.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 + i * 0.12 }}>
            <motion.div
              className="relative aspect-[4/5] overflow-hidden rounded-lg bg-surface"
              animate={i === 0 ? { scale: [1, 1, 0.94, 1] } : undefined}
              transition={i === 0 ? { delay: 2.4, duration: 0.5, times: [0, 0.3, 0.6, 1] } : undefined}
            >
              <Image src={l.images[0]} alt="" fill sizes="110px" className="object-cover" />
              {i === 0 && (
                <motion.span
                  className="absolute top-1/2 left-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1.6], opacity: [0.8, 0] }}
                  transition={{ delay: 2.6, duration: 0.6 }}
                />
              )}
            </motion.div>
            <p className="mt-1 text-[10px] font-semibold text-ink-950">{formatCedi(l.price)}</p>
            <p className="truncate text-[9px] text-ink-500">{l.title}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function PayScreen() {
  const total = casio.price + Math.round(casio.price * 0.04 * 100) / 100;
  return (
    <div className="flex h-full flex-col">
      <p className="text-base font-semibold tracking-tight text-ink-950">Checkout</p>
      <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-surface p-2">
        <span className="relative size-11 shrink-0 overflow-hidden rounded-lg">
          <Image src={casio.images[0]} alt="" fill sizes="44px" className="object-cover" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-medium text-ink-950">{casio.title}</span>
          <span className="text-[10px] text-ink-500">from Wellington M.</span>
        </span>
      </div>
      <div className="mt-4 space-y-1.5 text-[11px]">
        <Row k="Item" v={formatCedi(casio.price)} />
        <Row k="Protection" v={formatCedi(total - casio.price)} />
        <div className="border-t border-line pt-1.5">
          <Row k="Total" v={formatCedi(total)} strong />
        </div>
      </div>
      <div className="relative mt-auto mb-6">
        <motion.div
          className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-maroon-700 text-[12px] font-semibold text-white"
          animate={{ scale: [1, 1, 0.95, 1] }}
          transition={{ duration: 0.6, delay: 0.7, times: [0, 0.3, 0.6, 1] }}
        >
          <Lock className="size-3.5" aria-hidden /> Pay {formatCedi(total)}
        </motion.div>
        <motion.div
          className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-ink-950 text-[12px] font-semibold text-canvas"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.4, type: "spring", stiffness: 300, damping: 20 }}
        >
          <motion.span
            initial={{ rotate: -30, y: -3 }}
            animate={{ rotate: 0, y: 0 }}
            transition={{ delay: 1.8, type: "spring", stiffness: 400, damping: 12 }}
          >
            <Lock className="size-3.5" aria-hidden />
          </motion.span>
          {formatCedi(total)} held by Hilltop
        </motion.div>
      </div>
    </div>
  );
}

function MeetScreen() {
  return (
    <div className="flex h-full flex-col">
      <p className="text-base font-semibold tracking-tight text-ink-950">Meet-up</p>
      <div className="relative mt-3 h-56 overflow-hidden rounded-xl bg-surface">
        <svg viewBox="0 0 200 220" className="absolute inset-0 size-full" aria-hidden>
          {[40, 90, 140, 190].map((y) => (
            <line key={y} x1="0" x2="200" y1={y} y2={y} className="stroke-line-strong" strokeWidth="6" />
          ))}
          {[50, 120, 170].map((x) => (
            <line key={x} y1="0" y2="220" x1={x} x2={x} className="stroke-line-strong" strokeWidth="6" />
          ))}
          <rect x="62" y="100" width="46" height="30" rx="4" className="fill-line" />
          <motion.path
            d="M20 190 L50 190 L50 140 L120 140 L120 112"
            fill="none"
            className="stroke-maroon-700"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="1 0"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.6, delay: 0.3, ease: "easeInOut" }}
          />
          <circle cx="20" cy="190" r="6" className="fill-ink-950" />
        </svg>
        <motion.div
          className="absolute top-[36%] left-[56%]"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.8, type: "spring", stiffness: 300, damping: 14 }}
        >
          <span className="absolute top-full left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-maroon-700/40" />
          <MapPin className="relative size-7 fill-maroon-700 text-white" aria-hidden />
        </motion.div>
      </div>
      <motion.div
        className="mt-3 rounded-xl bg-surface p-2.5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.2 }}
      >
        <p className="text-[11px] font-semibold text-ink-950">Library entrance</p>
        <p className="text-[10px] text-ink-500">Today, 4 to 6pm with Wellington</p>
      </motion.div>
    </div>
  );
}

function DoneScreen() {
  return (
    <div className="flex h-full flex-col items-center pt-10 text-center">
      <div className="relative">
        <Confetti count={14} spread={60} delay={0.45} size={6} />
        <motion.span
          className="relative grid size-16 place-items-center rounded-full bg-success text-white"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.2 }}
        >
          <Check className="size-8" strokeWidth={3} aria-hidden />
        </motion.span>
      </div>
      <p className="mt-6 text-sm font-semibold text-ink-950">Collected</p>
      <p className="mt-1 text-[11px] text-ink-500">GH₵166.40 released to Wellington</p>
      <div className="mt-6 flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.span
            key={i}
            initial={{ scale: 0, rotate: -40 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 1 + i * 0.12, type: "spring", stiffness: 400, damping: 12 }}
          >
            <Star className="size-5 fill-[#d9b45a] text-[#d9b45a]" aria-hidden />
          </motion.span>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-ink-500">Rate your meet-up</p>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong ? "font-semibold text-ink-950" : "text-ink-500")}>
      <span>{k}</span>
      <span className="text-ink-950 tabular">{v}</span>
    </div>
  );
}
