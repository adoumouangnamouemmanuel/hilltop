"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "./ui";

/**
 * Bottom sheet on phones (drag the handle down to dismiss), centred dialog from `sm` up
 * unless `mobileOnly` is set.
 */
export function Sheet({
  open,
  onClose,
  title,
  headerAction,
  footer,
  children,
  dismissable = true,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  dismissable?: boolean;
  className?: string;
}) {
  const drag = useDragControls();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismissable && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, dismissable]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => dismissable && onClose()}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 40 }}
            drag={dismissable ? "y" : false}
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => (info.offset.y > 120 || info.velocity.y > 600) && onClose()}
            className={cn(
              "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-elevated shadow-pop sm:max-w-[460px] sm:rounded-2xl",
              className,
            )}
          >
            <div className="touch-none pt-2.5 sm:hidden" onPointerDown={(e) => dismissable && drag.start(e)}>
              <div className="mx-auto h-1 w-10 rounded-full bg-line-strong" />
            </div>
            <div className="flex items-center justify-between px-5 pt-2 pb-3 sm:pt-4" onPointerDown={(e) => dismissable && drag.start(e)}>
              <h2 className="text-base font-semibold text-ink-950">{title}</h2>
              <div className="flex items-center gap-1">
                {headerAction}
                <button
                  type="button"
                  onClick={onClose}
                  disabled={!dismissable}
                  aria-label="Close"
                  className="grid size-9 place-items-center rounded-full text-ink-500 hover:bg-surface hover:text-ink-950 disabled:opacity-40"
                >
                  <X className="size-[18px]" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
            {footer && <div className="border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
