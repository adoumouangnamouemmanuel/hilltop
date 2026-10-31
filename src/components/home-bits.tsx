"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { activity } from "@/lib/data";
import { useCatalog } from "@/lib/use-catalog";
import { CategoryIcon } from "./category-icon";
import { Avatar } from "./ui";

const words = ["phones", "calculators", "jewellery", "textbooks", "homemade food", "earbuds"];

/** Cycles through what students sell, in the hero headline. */
export function RotatingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % words.length), 2200);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="relative inline-grid overflow-hidden align-bottom">
      {/* Widest word reserves the space so the line never jumps. */}
      <span className="invisible col-start-1 row-start-1">homemade food</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={words[i]}
          className="col-start-1 row-start-1 text-maroon-700"
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {words[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Live-feeling activity marquee. Pauses on hover. */
export function ActivityTicker() {
  const items = [...activity, ...activity];
  return (
    <div className="group relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)] py-1">
      <div className="flex w-max animate-marquee gap-3 group-hover:[animation-play-state:paused]">
        {items.map((a, i) => (
          <div
            key={i}
            className="flex shrink-0 items-center gap-2.5 rounded-full border border-line bg-elevated py-1.5 pr-4 pl-1.5 text-[13px]"
          >
            <Avatar name={a.who} size={26} />
            <span className="text-ink-700">
              <span className="font-medium text-ink-950">{a.who}</span> {a.what}
            </span>
            <span className="text-xs text-ink-400">{a.when}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Category icon grid, loaded from the catalog so new categories show up automatically. */
export function CategoryGrid() {
  const { categories, counts, loading } = useCatalog();
  return (
    <div className="-mx-4 no-scrollbar flex snap-x gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0 md:grid-cols-7">
      <AnimatePresence initial={false}>
        {categories.map((c, i) => (
          <motion.div
            key={c.id}
            layout
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: Math.min(i, 14) * 0.03, type: "spring", stiffness: 400, damping: 30 }}
            className="snap-start"
          >
            <Link
              href={`/browse?category=${c.id}`}
              className="group flex w-[86px] flex-col items-center gap-2 rounded-2xl p-2 text-center transition-colors hover:bg-surface sm:w-auto sm:p-3"
            >
              <motion.span
                whileHover={{ y: -3, rotate: -4 }}
                whileTap={{ scale: 0.9 }}
                className="grid size-14 place-items-center rounded-2xl bg-surface text-ink-950 transition-colors group-hover:bg-ink-950 group-hover:text-canvas"
              >
                <CategoryIcon name={c.icon} className="size-6" />
              </motion.span>
              <span className="text-xs leading-tight font-medium text-ink-950">{c.label}</span>
              <span className="-mt-1.5 text-[11px] text-ink-400">{counts[c.id] ? `${counts[c.id]} items` : "New"}</span>
            </Link>
          </motion.div>
        ))}
      </AnimatePresence>
      {loading && <span className="sr-only">Loading more categories</span>}
    </div>
  );
}
