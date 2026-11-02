"use client";

import { useSyncExternalStore } from "react";
import { Check, ChevronDown, Lightbulb } from "lucide-react";
import type { ListingFormValues } from "@/lib/validation";
import { cn } from "@/components/ui";

/*
 * A checklist for first-time sellers that fills in as they go, with a tip for the
 * step they're on. It can be hidden, and stays hidden on this device.
 */

const HIDDEN = "hilltop:sell-guide-hidden";

const steps: { label: string; done: (v: ListingFormValues) => boolean; tip: string }[] = [
  {
    label: "Photos",
    done: (v) => (v.photos?.length ?? 0) > 0,
    tip: "Take clear photos in daylight, from a few angles. The first one is the cover buyers see.",
  },
  { label: "Category", done: (v) => !!v.category, tip: "Pick where buyers would look for it. The details to fill in follow the category." },
  {
    label: "Title",
    done: (v) => (v.title ?? "").trim().length >= 3,
    tip: "Say exactly what it is: brand, model, size or colour, like “Casio fx-991EX calculator”.",
  },
  {
    label: "Price",
    done: (v) => Number(v.price) > 0,
    tip: "The price guide under the price shows what similar items go for. Fair prices sell fastest.",
  },
  {
    label: "Pickup spot",
    done: (v) => !!v.pickup,
    tip: "Choose a public spot you pass often. Buyers pick a time; you can agree another in chat.",
  },
];

const listeners = new Set<() => void>();
const readHidden = () => {
  try {
    return localStorage.getItem(HIDDEN) === "1";
  } catch {
    return false;
  }
};
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

export function SellGuide({ values }: { values: ListingFormValues }) {
  const hidden = useSyncExternalStore(subscribe, readHidden, () => false);
  const toggle = () => {
    try {
      localStorage.setItem(HIDDEN, hidden ? "0" : "1");
    } catch {}
    listeners.forEach((l) => l());
  };
  const done = steps.map((s) => s.done(values));
  const current = done.indexOf(false);
  const tip =
    current === -1 ? "All set. Publish, and buyers can message you, make offers or reserve it. You'll be notified." : steps[current].tip;

  return (
    <div className="mt-6 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <button type="button" onClick={toggle} aria-expanded={!hidden} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="text-sm font-semibold text-ink-950">
          How to list · {done.filter(Boolean).length} of {steps.length} done
        </span>
        <span className="flex items-center gap-1 text-xs text-ink-500">
          {hidden ? "Show guide" : "Hide"}
          <ChevronDown className={cn("size-4 transition-transform", !hidden && "rotate-180")} aria-hidden />
        </span>
      </button>
      {!hidden && (
        <>
          <ol className="mt-4 flex flex-wrap gap-2">
            {steps.map((s, i) => (
              <li
                key={s.label}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                  done[i] ? "bg-success-bg text-success" : i === current ? "bg-ink-950 text-canvas" : "bg-elevated text-ink-500",
                )}
              >
                {done[i] ? <Check className="size-3.5" aria-hidden /> : <span className="tabular">{i + 1}</span>}
                {s.label}
              </li>
            ))}
          </ol>
          <p className="mt-3 flex items-start gap-2 text-[13.5px] leading-6 text-ink-700">
            <Lightbulb className="mt-1 size-4 shrink-0 text-maroon-700" aria-hidden />
            {tip}
          </p>
        </>
      )}
    </div>
  );
}
