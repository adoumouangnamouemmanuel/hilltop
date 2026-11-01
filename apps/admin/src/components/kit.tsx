"use client";

import { useId, useState } from "react";
import { motion } from "framer-motion";
import { Lock, Plus, Search, X } from "lucide-react";
import { buttonClass, cn } from "@hilltop/ui/ui";
import { Sheet } from "@hilltop/ui/sheet";
import type { Permission } from "@hilltop/shared/permissions";
import { useCan } from "@/lib/store";

/* Building blocks shared by the portal's screens. */

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink-950 sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-line bg-elevated", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink-950">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

export type Tone = "neutral" | "maroon" | "success" | "warning" | "muted";

const tones: Record<Tone, string> = {
  neutral: "bg-surface text-ink-700",
  maroon: "bg-maroon-50 text-maroon-700",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  muted: "bg-surface text-ink-500",
};

export function Badge({
  tone = "neutral",
  dot,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-line-strong bg-elevated pr-3 pl-10 text-[13px] text-ink-950 placeholder:text-ink-400 focus:border-ink-900 focus:outline-none"
      />
    </label>
  );
}

/** Segmented filter with an animated pill. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { id: T; label: string; count?: number }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const layoutId = useId();
  return (
    <div role="tablist" aria-label={label} className={cn("no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-surface p-1", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
            value === o.id ? "text-ink-950" : "text-ink-500 hover:text-ink-900",
          )}
        >
          {value === o.id && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 rounded-lg bg-elevated shadow-card"
              transition={{ type: "spring", stiffness: 500, damping: 38 }}
            />
          )}
          <span className="relative">{o.label}</span>
          {o.count !== undefined && <span className="relative text-[11px] text-ink-400 tabular">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: React.ElementType;
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-surface text-ink-500">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-4 text-[15px] font-semibold text-ink-950">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-500">{body}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

/** Shown in place of a page the signed-in admin can't open. */
export function Locked({ permission }: { permission: Permission }) {
  return (
    <Card className="mx-auto mt-10 max-w-md">
      <EmptyState
        icon={Lock}
        title="You don't have access to this page"
        body={`It needs the "${permission}" permission. Ask an owner to update your role.`}
      />
    </Card>
  );
}

export function Gate({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  return useCan(permission) ? children : <Locked permission={permission} />;
}

// Tables

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">{children}</table>
    </div>
  );
}

export function Th({ children, className, align = "left" }: { children?: React.ReactNode; className?: string; align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-line px-4 py-2.5 text-[11.5px] font-medium tracking-wide text-ink-500 uppercase first:pl-5 last:pr-5",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, align = "left" }: { children?: React.ReactNode; className?: string; align?: "left" | "right" }) {
  return (
    <td
      className={cn(
        "border-b border-line px-4 py-3 align-middle text-ink-700 first:pl-5 last:pr-5",
        align === "right" && "text-right tabular",
        className,
      )}
    >
      {children}
    </td>
  );
}

// Form controls

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-900">
        {label}
      </label>
      {children(id)}
      {error ? <p className="mt-1.5 text-xs text-maroon-700">{error}</p> : hint && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-xl border border-line-strong bg-elevated px-3.5 text-[13.5px] text-ink-950 placeholder:text-ink-400 focus:border-ink-900 focus:outline-none disabled:bg-surface disabled:text-ink-500";

/*
 * cn() is plain clsx, so a size passed in className would fight the base classes.
 * Drop base classes from the same group (width, height, horizontal padding) when overridden.
 */
const groups: [RegExp, RegExp][] = [
  [/^(sm:|md:|lg:)?w-/, /^w-/],
  [/^h-/, /^h-/],
  [/^min-h-/, /^min-h-/],
  [/^(px|pl|pr)-/, /^px-/],
  [/^py-/, /^py-/],
];

export function withOverrides(base: string, extra?: string) {
  if (!extra) return base;
  const mine = extra.split(/\s+/);
  const drop = groups.filter(([match]) => mine.some((c) => match.test(c))).map(([, strip]) => strip);
  return cn(
    base
      .split(" ")
      .filter((c) => !drop.some((d) => d.test(c)))
      .join(" "),
    extra,
  );
}

export function TextInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={withOverrides(inputClass, className)} {...props} />;
}

export function TextArea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={withOverrides(withOverrides(inputClass, "h-auto min-h-[88px] resize-y py-2.5 leading-relaxed"), className)}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={withOverrides(
        withOverrides(inputClass, "appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9 pl-3.5"),
        className,
      )}
      style={{ backgroundImage: chevron }}
      {...props}
    >
      {children}
    </select>
  );
}

const chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

/** Number input with an optional unit or prefix, e.g. GH₵ or %. */
export function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
  min,
  max,
  step,
  id,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-10 items-center rounded-xl border border-line-strong bg-elevated focus-within:border-ink-900",
        disabled && "bg-surface",
      )}
    >
      {prefix && <span className="pl-3.5 text-[13px] text-ink-500">{prefix}</span>}
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
        className="h-full w-full min-w-0 bg-transparent px-3 text-[13.5px] text-ink-950 tabular focus:outline-none disabled:text-ink-500"
      />
      {suffix && <span className="pr-3.5 text-[13px] text-ink-500">{suffix}</span>}
    </div>
  );
}

/** Editable list of short strings shown as removable chips. */
export function TagList({
  values,
  onChange,
  placeholder,
  label,
  disabled,
  max,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  label: string;
  disabled?: boolean;
  max?: number;
}) {
  const [text, setText] = useState("");
  const full = max !== undefined && values.length >= max;
  function add() {
    const v = text.trim();
    if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase()) || full) return;
    onChange([...values, v]);
    setText("");
  }
  return (
    <div className="rounded-xl border border-line-strong bg-elevated p-2 focus-within:border-ink-900">
      <ul className="flex flex-wrap gap-1.5" aria-label={label}>
        {values.map((v) => (
          <motion.li layout key={v} className="flex items-center gap-1 rounded-lg bg-surface py-1 pr-1 pl-2.5 text-[13px] text-ink-900">
            {v}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                className="grid size-5 place-items-center rounded-md text-ink-500 hover:bg-surface-2 hover:text-ink-950"
              >
                <X className="size-3" aria-hidden />
              </button>
            )}
          </motion.li>
        ))}
        {!disabled && !full && (
          <li className="flex min-w-[10rem] flex-1 items-center">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  add();
                } else if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
              }}
              onBlur={add}
              placeholder={placeholder}
              aria-label={`Add to ${label}`}
              className="h-7 w-full bg-transparent px-1.5 text-[13px] text-ink-950 placeholder:text-ink-400 focus:outline-none"
            />
          </li>
        )}
      </ul>
    </div>
  );
}

export function AddButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={buttonClass("outline", "sm")}>
      <Plus className="size-4" aria-hidden />
      {children}
    </button>
  );
}

/** Confirmation dialog for consequential actions. */
export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  danger,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass("ghost", "md")}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={buttonClass(danger ? "primary" : "dark", "md")}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-ink-700">{body}</p>
      {children}
    </Sheet>
  );
}

/** A stat tile: label, big number, optional context line. */
export function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ElementType;
  tone?: "warning" | "maroon";
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-500">{label}</p>
        {Icon && (
          <span
            className={cn(
              "grid size-8 place-items-center rounded-lg",
              tone === "warning"
                ? "bg-warning-bg text-warning"
                : tone === "maroon"
                  ? "bg-maroon-50 text-maroon-700"
                  : "bg-surface text-ink-700",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-ink-950 tabular">{value}</p>
      {sub && <div className="mt-1 text-xs text-ink-500">{sub}</div>}
    </Card>
  );
}
