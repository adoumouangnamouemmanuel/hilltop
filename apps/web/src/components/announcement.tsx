"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Info, Megaphone, TriangleAlert, X } from "lucide-react";
import { useConfig } from "@/lib/config";
import { cn } from "./ui";

const tones = {
  info: { icon: Info, className: "bg-ink-950 text-canvas" },
  promo: { icon: Megaphone, className: "bg-maroon-700 text-white" },
  warning: { icon: TriangleAlert, className: "bg-warning-bg text-warning" },
};

/** Site-wide banner set from the admin portal. Dismissing hides that exact message. */
export function Announcement() {
  const { announcement } = useConfig();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const show = announcement.enabled && announcement.message && dismissed !== announcement.message && !pathname.startsWith("/sign");
  const tone = tones[announcement.tone];

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          role="region"
          aria-label="Announcement"
          initial={{ height: 0 }}
          animate={{ height: "auto" }}
          exit={{ height: 0 }}
          className={cn("overflow-hidden text-[13px]", tone.className)}
        >
          <div className="container-page flex items-center gap-3 py-2">
            <tone.icon className="size-4 shrink-0" aria-hidden />
            <p className="flex-1">
              {announcement.message}
              {announcement.href && (
                <Link href={announcement.href} className="ml-2 inline-flex items-center gap-1 font-semibold underline underline-offset-2">
                  Learn more <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              )}
            </p>
            <button
              type="button"
              onClick={() => setDismissed(announcement.message)}
              aria-label="Dismiss announcement"
              className="grid size-7 shrink-0 place-items-center rounded-full opacity-80 hover:opacity-100"
            >
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
