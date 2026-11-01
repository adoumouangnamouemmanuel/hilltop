"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import { useDismiss } from "@hilltop/ui/hooks";
import { cn } from "@hilltop/ui/ui";

export type RowAction = {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
  disabled?: boolean;
};

/** The "more" menu at the end of a table row. Actions the admin can't take are hidden. */
export function RowMenu({ actions, label }: { actions: RowAction[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const visible = actions.filter((a) => !a.hidden);
  if (!visible.length) return null;
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${label}`}
        className="grid size-8 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-surface hover:text-ink-950"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full right-0 z-30 mt-1 min-w-48 origin-top-right rounded-xl border border-line bg-elevated p-1.5 text-left shadow-pop"
          >
            {visible.map((a) => (
              <button
                key={a.label}
                type="button"
                role="menuitem"
                disabled={a.disabled}
                onClick={() => {
                  setOpen(false);
                  a.onClick();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] whitespace-nowrap disabled:opacity-40",
                  a.danger ? "text-maroon-700 hover:bg-maroon-50" : "text-ink-700 hover:bg-surface hover:text-ink-950",
                )}
              >
                <a.icon className="size-4" aria-hidden />
                {a.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
