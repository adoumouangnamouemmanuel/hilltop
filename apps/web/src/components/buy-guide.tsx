"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Compass, Lightbulb, Sparkles, X } from "lucide-react";
import { useConfig } from "@/lib/config";
import { formatCedi } from "@/lib/format";
import { useCatalog } from "@/lib/use-catalog";
import { CategoryIcon } from "./category-icon";
import { Sheet } from "./sheet";
import { buttonClass, cn } from "./ui";

/*
 * "Help me find something": three quick questions that take a student who doesn't
 * know what to buy to matching items, then short tips on the results and the item
 * page that lead them to Buy now, Make offer or Message. The tips last for the
 * browser session, until the student closes them.
 */

const KEY = "hilltop:guide";
const listeners = new Set<() => void>();
const read = () => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};
function setGuide(value: string | null) {
  try {
    if (value) sessionStorage.setItem(KEY, value);
    else sessionStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

/** Whether the student is following the buying guide. */
export const useBuyGuide = () => useSyncExternalStore(subscribe, read, () => null) === "buy";

const budgets = [50, 100, 200, 500];

export function BuyGuideButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 hover:text-ink-950", className)}
      >
        <Compass className="size-4 text-maroon-700" aria-hidden />
        Not sure what you need? Let us help
      </button>
      <BuyGuide open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function BuyGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { categories } = useCatalog();
  const { search } = useConfig();
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const [max, setMax] = useState<number | null>(null);
  const [q, setQ] = useState("");

  function finish(query = q) {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (max) params.set("max", String(max));
    if (query.trim()) params.set("q", query.trim());
    setGuide("buy");
    onClose();
    setTimeout(() => setStep(0), 300);
    router.push(`/browse${params.size ? `?${params}` : ""}`);
  }

  const titles = ["What are you looking for?", "What's your budget?", "Anything specific?"];
  return (
    <Sheet open={open} onClose={onClose} title={`Find something · ${step + 1} of 3`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18 }}
        >
          <p className="text-lg font-semibold tracking-[-0.02em] text-ink-950">{titles[step]}</p>

          {step === 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCategory(c.id);
                    setStep(1);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs transition-colors",
                    category === c.id ? "border-ink-950 bg-surface" : "border-line hover:border-ink-400",
                  )}
                >
                  <CategoryIcon name={c.icon} className="size-5 text-ink-950" />
                  <span className="line-clamp-2 text-ink-700">{c.label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCategory(null);
                  setStep(1);
                }}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-2 py-3 text-xs text-ink-700 hover:border-ink-400"
              >
                <Sparkles className="size-5 text-maroon-700" aria-hidden />
                Show me everything
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {budgets.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    setMax(b);
                    setStep(2);
                  }}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm",
                    max === b ? "border-ink-950 bg-ink-950 text-canvas" : "border-line-strong text-ink-700",
                  )}
                >
                  Under {formatCedi(b)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMax(null);
                  setStep(2);
                }}
                className="rounded-full border border-line-strong px-4 py-2 text-sm text-ink-700"
              >
                Any budget
              </button>
            </div>
          )}

          {step === 2 && (
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                finish();
              }}
            >
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="A brand, a size, a colour… or leave it empty"
                aria-label="Anything specific"
                className="h-12 w-full rounded-xl border border-line-strong bg-elevated px-4 text-[16px] outline-none focus:border-ink-950 md:text-sm"
              />
              {search.popular.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="text-xs text-ink-500">Students often look for</span>
                  {search.popular.slice(0, 6).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => finish(p)}
                      className="rounded-full bg-surface px-2.5 py-1 text-xs text-ink-700 hover:text-ink-950"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
              <button type="submit" className={buttonClass("dark", "lg", "mt-6 w-full")}>
                Show me items <ArrowRight className="size-4" aria-hidden />
              </button>
            </form>
          )}

          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="mt-5 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-950"
            >
              <ArrowLeft className="size-4" aria-hidden /> Back
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </Sheet>
  );
}

/** A guide tip, shown while the student follows the buying guide. */
export function GuideTip({ where }: { where: "results" | "listing" }) {
  const active = useBuyGuide();
  if (!active) return null;
  const text =
    where === "results"
      ? "Tap any item to see its photos, details and the seller. Use the filters to narrow things down."
      : "Like it? Buy now reserves it, and you pay the seller when you meet. Make offer asks for a lower price. Message the seller with any question first.";
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border border-maroon-200 bg-maroon-50 p-4 text-[13.5px] leading-6 text-ink-950"
      role="note"
    >
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-maroon-700" aria-hidden />
      <p className="flex-1">{text}</p>
      <button
        type="button"
        onClick={() => setGuide(null)}
        aria-label="Close the guide"
        className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-maroon-100"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
