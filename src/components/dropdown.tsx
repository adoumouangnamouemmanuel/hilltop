"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./ui";

export function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  align = "right",
  className,
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  onChange: (v: T) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-line-strong bg-elevated px-3.5 text-[13px] text-ink-900 transition-colors hover:border-ink-900"
      >
        <span className="truncate">
          <span className="text-ink-500">{label}: </span>
          <span className="font-medium">{options[value]}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-ink-500 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className={cn(
              "absolute top-full z-30 mt-1.5 min-w-full whitespace-nowrap rounded-xl border border-line bg-elevated p-1.5 shadow-pop",
              align === "right" ? "right-0" : "left-0",
            )}
          >
            {(Object.keys(options) as T[]).map((key) => (
              <li key={key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={key === value}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-6 rounded-lg px-3 py-2 text-left text-[13px] text-ink-700 hover:bg-surface hover:text-ink-950"
                >
                  {options[key]}
                  {key === value && <Check className="size-4 text-ink-950" aria-hidden />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
