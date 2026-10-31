"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePref } from "./theme";
import { cn } from "./ui";

/** Icon button that flips between light and dark. */
export function ThemeToggle({ className }: { className?: string }) {
  const { isDark, setTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative grid size-10 place-items-center overflow-hidden rounded-xl text-ink-700 transition-colors hover:bg-surface hover:text-ink-950",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? "moon" : "sun"}
          initial={{ y: 14, opacity: 0, rotate: -40 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 40 }}
          transition={{ duration: 0.22 }}
        >
          {isDark ? <Moon className="size-[19px]" aria-hidden /> : <Sun className="size-[19px]" aria-hidden />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

const options: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "Auto", icon: Monitor },
];

/** Three-way segmented control for menus and settings. */
export function ThemeSegmented() {
  const { pref, setTheme } = useTheme();
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1" role="radiogroup" aria-label="Theme">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={pref === o.id}
          onClick={() => setTheme(o.id)}
          className={cn(
            "relative flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium",
            pref === o.id ? "text-ink-950" : "text-ink-500",
          )}
        >
          {pref === o.id && (
            <motion.span
              layoutId="theme-seg"
              className="absolute inset-0 rounded-lg bg-elevated shadow-card"
              transition={{ type: "spring", stiffness: 500, damping: 36 }}
            />
          )}
          <o.icon className="relative size-3.5" aria-hidden />
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
