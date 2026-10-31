"use client";

import { forwardRef } from "react";
import { cn } from "@/components/ui";

export const fieldClass =
  "w-full rounded-xl border bg-elevated px-4 text-[15px] text-ink-950 outline-none transition-colors placeholder:text-ink-400 hover:border-ink-400 focus:border-ink-950";

export const borderFor = (error?: unknown) => (error ? "border-maroon-600" : "border-line-strong");

export function Section({
  title,
  hint,
  error,
  id,
  children,
}: {
  title: string;
  hint?: string;
  error?: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-36 py-7 first:pt-0" data-invalid={!!error || undefined}>
      <div className="mb-3.5 flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] font-semibold text-ink-950">{title}</h2>
        {error ? (
          <span role="alert" className="text-xs text-maroon-700">
            {error}
          </span>
        ) : (
          hint && <span className="text-right text-xs text-ink-500">{hint}</span>
        )}
      </div>
      {children}
    </section>
  );
}

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-10 rounded-xl border px-4 text-sm transition-colors",
        active ? "border-ink-950 bg-ink-950 text-canvas" : "border-line-strong text-ink-700 hover:border-ink-900",
      )}
    >
      {children}
    </button>
  );
}

type MoneyProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; prefix?: string };

/** Numeric input with a label, optional currency prefix and inline error. */
export const LabeledInput = forwardRef<HTMLInputElement, MoneyProps>(function LabeledInput(
  { label, error, prefix, className, id, ...props },
  ref,
) {
  const inputId = id ?? `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-xs text-ink-500">
        {label}
      </label>
      <span className="relative block">
        {prefix && <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[15px] text-ink-500">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          inputMode="decimal"
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(fieldClass, borderFor(error), "h-12 tabular", prefix && "pl-14")}
          {...props}
        />
      </span>
      {error && (
        <p id={`${inputId}-error`} className="mt-1.5 text-xs text-maroon-700">
          {error}
        </p>
      )}
    </div>
  );
});
