"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Heart } from "lucide-react";
import { dismissToast, useToasts } from "./toast";
import { cn } from "./ui";

export function Toaster() {
  const toasts = useToasts();
  const pathname = usePathname();
  // Sit above the mobile tab bar or the listing buy bar.
  const lifted = !pathname.startsWith("/sign");

  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6",
        lifted ? "bottom-24" : "bottom-6",
      )}
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(_, info) => Math.abs(info.offset.x) > 80 && dismissToast(t.id)}
            className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl bg-ink-950 py-2.5 pr-2 pl-3 text-sm text-canvas shadow-pop"
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full",
                t.tone === "saved" ? "bg-maroon-700 text-white" : "bg-canvas/15",
              )}
            >
              {t.tone === "saved" ? (
                <Heart className="size-3.5 fill-current" aria-hidden />
              ) : (
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
              )}
            </span>
            <span className="flex-1 pr-1">{t.message}</span>
            {t.action && (
              <Link
                href={t.action.href}
                onClick={() => dismissToast(t.id)}
                className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold hover:bg-canvas/10"
              >
                {t.action.label}
              </Link>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
