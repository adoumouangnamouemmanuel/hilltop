"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { makeCustomCategory } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useCatalog } from "@/lib/use-catalog";
import { CategoryIcon } from "@/components/category-icon";
import { buttonClass, cn } from "@/components/ui";
import { borderFor, fieldClass } from "./form-bits";

/** Category tiles from the catalog, plus creating a new category on the spot. */
export function CategoryPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { addCategory } = useStore();
  const catalog = useCatalog();
  const [draft, setDraft] = useState<string | null>(null);

  function create() {
    const label = draft?.trim();
    if (!label) return;
    const cat = makeCustomCategory(label);
    addCategory(cat);
    onChange(cat.id);
    setDraft(null);
    toast(`“${cat.label}” added as a new category`, { tone: "success" });
  }

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
        {draft === null && (
          <button
            type="button"
            onClick={() => setDraft("")}
            className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong px-2 py-3 text-xs font-medium text-ink-500 hover:border-ink-900 hover:text-ink-950"
          >
            <Plus className="size-5" aria-hidden />
            New category
          </button>
        )}
      </div>
      <AnimatePresence>
        {draft !== null && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex gap-2">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 32))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    create();
                  }
                  if (e.key === "Escape") setDraft(null);
                }}
                placeholder="e.g. Musical instruments"
                className={cn(fieldClass, borderFor(), "h-11")}
                aria-label="New category name"
              />
              <button type="button" onClick={create} disabled={!draft.trim()} className={buttonClass("dark", "md")}>
                Add
              </button>
              <button type="button" onClick={() => setDraft(null)} className={buttonClass("ghost", "md", "px-3")} aria-label="Cancel">
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-500">It becomes available to everyone once your listing is published.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
