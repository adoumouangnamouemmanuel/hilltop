"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Home, Plus, Search, User } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "./ui";

export function MobileTabBar() {
  const pathname = usePathname();
  const { saved, user } = useStore();

  // Listing pages show their own buy bar, auth screens are distraction-free.
  if (pathname.startsWith("/listing/") || pathname.startsWith("/sign")) return null;

  const tabs = [
    { href: "/", label: "Home", icon: Home, active: pathname === "/" },
    { href: "/browse", label: "Browse", icon: Search, active: pathname.startsWith("/browse") },
    { href: "/sell", label: "Sell", icon: Plus, active: pathname === "/sell", primary: true },
    { href: "/saved", label: "Saved", icon: Heart, active: pathname === "/saved", badge: saved.length },
    { href: user ? "/me" : "/sign-in", label: user ? "You" : "Log in", icon: User, active: pathname === "/me" },
  ];

  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Main">
      <ul className="grid h-[62px] grid-cols-5 rounded-[22px] border border-line bg-elevated/90 px-1 shadow-pop backdrop-blur-xl">
        {tabs.map((t) => (
          <li key={t.label} className="relative">
            <Link
              href={t.href}
              className={cn(
                "relative flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                t.active ? "text-ink-950" : "text-ink-400",
              )}
              aria-current={t.active ? "page" : undefined}
            >
              {t.active && !t.primary && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-x-1.5 inset-y-1.5 rounded-2xl bg-surface"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              {t.primary ? (
                <motion.span
                  whileTap={{ scale: 0.88, rotate: 90 }}
                  className="relative -mt-0.5 grid size-11 place-items-center rounded-2xl bg-maroon-700 text-white shadow-[0_6px_16px_-4px_rgb(118_29_39/0.6)]"
                >
                  <t.icon className="size-5" strokeWidth={2.5} aria-hidden />
                </motion.span>
              ) : (
                <motion.span whileTap={{ scale: 0.8 }} animate={{ y: t.active ? -1 : 0 }} className="relative">
                  <t.icon
                    className={cn("size-[21px]", t.active && t.label === "Saved" && "fill-ink-950")}
                    strokeWidth={t.active ? 2.25 : 1.75}
                    aria-hidden
                  />
                  <AnimatePresence>
                    {!!t.badge && (
                      <motion.span
                        key={t.badge}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{ type: "spring", stiffness: 600, damping: 15 }}
                        className="absolute -top-1.5 -right-2.5 grid min-w-4 place-items-center rounded-full bg-maroon-700 px-1 text-[10px] leading-4 font-semibold text-white"
                      >
                        {t.badge}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.span>
              )}
              {!t.primary && <span className="relative">{t.label}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
