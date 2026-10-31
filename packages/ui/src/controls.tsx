"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Star } from "lucide-react";
import { relativeTime } from "@hilltop/shared/format";
import { useNow } from "./hooks";
import { cn } from "./ui";

/** On/off switch. Pass `label` for screen readers when there's no visible label next to it. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", checked ? "bg-ink-950" : "bg-line-strong")}
    >
      <motion.span
        className="absolute top-0.5 size-5 rounded-full bg-canvas shadow-sm"
        initial={false}
        animate={{ left: checked ? 18 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 34 }}
      />
    </button>
  );
}

/** Custom checkbox backed by a real (visually hidden) input. */
export function Checkbox({
  checked,
  onChange,
  children,
  invalid,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("flex items-start gap-3 text-sm text-ink-700", className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        className={cn(
          "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-maroon-600 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas",
          checked ? "border-ink-950 bg-ink-950 text-canvas" : invalid ? "border-maroon-600 bg-elevated" : "border-line-strong bg-elevated",
        )}
        aria-hidden
      >
        <AnimatePresence initial={false}>
          {checked && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 30 }}
            >
              <Check className="size-3" strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="flex-1">{children}</span>
    </label>
  );
}

/** Star rating. Interactive when `onChange` is given, otherwise display only. */
export function Stars({ value, onChange, size = 20 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  if (!onChange) {
    return (
      <span className="inline-flex gap-0.5" aria-label={`${value} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            style={{ width: size, height: size }}
            className={i <= Math.round(value) ? "fill-ink-950 text-ink-950" : "text-ink-300"}
            aria-hidden
          />
        ))}
      </span>
    );
  }
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <motion.button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
          whileTap={{ scale: 0.8 }}
          onMouseEnter={() => setHover(i)}
          onClick={() => onChange(i)}
          className="p-0.5"
        >
          <Star
            style={{ width: size, height: size }}
            className={cn("transition-colors", i <= shown ? "fill-[#d9b45a] text-[#d9b45a]" : "text-ink-300")}
            aria-hidden
          />
        </motion.button>
      ))}
    </div>
  );
}

/** "5 min ago", ticking. Renders nothing on the server so markup matches after hydration. */
export function RelativeTime({ at, className }: { at: number; className?: string }) {
  const now = useNow();
  return (
    <time dateTime={new Date(at).toISOString()} className={className} suppressHydrationWarning>
      {now ? relativeTime(at, now) : ""}
    </time>
  );
}
