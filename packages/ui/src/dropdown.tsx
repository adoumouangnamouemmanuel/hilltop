"use client";

import { useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useDismiss } from "./hooks";
import { cn } from "./ui";

/** Select-style dropdown with listbox keyboard support: arrows, Home/End, Enter and Escape. */
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
  const keys = Object.keys(options) as T[];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  useDismiss(ref, open, () => setOpen(false));

  function openAt(index: number) {
    setActive(index);
    setOpen(true);
  }

  function choose(key: T) {
    onChange(key);
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const current = keys.indexOf(value);
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openAt(Math.max(0, current));
      }
      return;
    }
    const moves: Record<string, number> = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: keys.length - 1 };
    if (e.key in moves) {
      e.preventDefault();
      setActive(Math.min(keys.length - 1, Math.max(0, moves[e.key])));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(keys[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") setOpen(false);
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        ref={trigger}
        type="button"
        onClick={() => (open ? setOpen(false) : openAt(Math.max(0, keys.indexOf(value))))}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={`${label}: ${options[value]}`}
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
            id={listId}
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className={cn(
              "absolute top-full z-30 mt-1.5 min-w-full rounded-xl border border-line bg-elevated p-1.5 whitespace-nowrap shadow-pop",
              align === "right" ? "right-0" : "left-0",
            )}
          >
            {keys.map((key, i) => (
              <li
                key={key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={key === value}
                onMouseEnter={() => setActive(i)}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(key)}
                className={cn(
                  "flex items-center justify-between gap-6 rounded-lg px-3 py-2 text-[13px]",
                  i === active ? "bg-surface text-ink-950" : "text-ink-700",
                )}
              >
                {options[key]}
                {key === value && <Check className="size-4 text-ink-950" aria-hidden />}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
