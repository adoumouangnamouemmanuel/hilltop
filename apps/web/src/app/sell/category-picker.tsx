"use client";

import { motion } from "framer-motion";
import { MessageSquarePlus } from "lucide-react";
import { useConfig } from "@/lib/config";
import { useCatalog } from "@/lib/use-catalog";
import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/components/ui";

/**
 * Category tiles from the catalog. Only admins create categories, so sellers who
 * can't find a fit are pointed to the support team and to "Everything else".
 */
export function CategoryPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const catalog = useCatalog();
  const { brand } = useConfig();
  const fallback = catalog.categories.find((c) => c.id === "other");
  const request = `mailto:${brand.supportEmail}?subject=${encodeURIComponent("Category request")}&body=${encodeURIComponent(
    "Hi, I'd like to sell something that doesn't fit any category.\n\nWhat I'm selling:\nCategory I'd suggest:\n",
  )}`;

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5" role="radiogroup" aria-label="Category">
        {catalog.categories.map((c) => (
          <motion.button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={value === c.id}
            layout
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange(c.id)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center text-xs font-medium transition-colors",
              value === c.id ? "border-ink-950 bg-ink-950 text-canvas" : "border-line-strong text-ink-700 hover:border-ink-400",
            )}
          >
            <CategoryIcon name={c.icon} className="size-5" />
            <span className="leading-tight">{c.label}</span>
          </motion.button>
        ))}
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-ink-500">
        <MessageSquarePlus className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Can&rsquo;t find the right category?{" "}
          {fallback && (
            <>
              List it under{" "}
              <button type="button" onClick={() => onChange(fallback.id)} className="font-medium text-ink-900 underline underline-offset-2">
                {fallback.label}
              </button>{" "}
              for now, and{" "}
            </>
          )}
          <a href={request} className="font-medium text-ink-900 underline underline-offset-2">
            {fallback ? "ask us to add one" : "Ask us to add one"}
          </a>
          .
        </span>
      </p>
    </>
  );
}
