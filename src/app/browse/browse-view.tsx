"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { SearchX, SlidersHorizontal, X } from "lucide-react";
import { formatCedi } from "@/lib/format";
import {
  applyFilters,
  countActive,
  emptyFilters,
  filterableAttributes,
  filtersToQuery,
  parseFilters,
  popularSearches,
  sortOptions,
  withCategory,
  type Filters,
  type SortKey,
} from "@/lib/search";
import { useCatalog } from "@/lib/use-catalog";
import { useStore } from "@/lib/store";
import { CategoryIcon } from "@/components/category-icon";
import { Dropdown } from "@/components/dropdown";
import { ListingCard } from "@/components/listing-card";
import { Sheet } from "@/components/sheet";
import { buttonClass, cn } from "@/components/ui";
import { FilterPanel } from "./filter-panel";

export function BrowseView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { allListings } = useStore();
  const catalog = useCatalog();
  const [sheetOpen, setSheetOpen] = useState(false);

  const filters = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);
  const labelOf = (id: string) => catalog.get(id).label;
  const results = useMemo(() => applyFilters(allListings, filters, (id) => catalog.get(id).label), [allListings, filters, catalog]);
  const active = countActive(filters);
  const current = filters.category ? catalog.get(filters.category) : null;

  function replace(next: Filters) {
    const qs = filtersToQuery(next);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }
  const update = (patch: Partial<Filters>) => replace({ ...filters, ...patch });
  const clearAll = () => replace({ ...emptyFilters, q: filters.q, sort: filters.sort });

  // The category's main "type" attribute doubles as quick sub-category chips.
  const typeAttr = filterableAttributes(current).find((a) => a.key === "type" && a.type === "select");
  const selectedTypes = typeAttr ? (filters.attrs.type ?? []) : [];

  const title = filters.q ? `Results for “${filters.q}”` : current ? current.label : filters.sale ? "Move-Out Sale" : "All items";

  const chips: { key: string; label: string; remove: () => void }[] = [
    ...(current ? [{ key: "cat", label: current.label, remove: () => replace(withCategory(filters, null)) }] : []),
    ...Object.entries(filters.attrs).flatMap(([k, values]) => {
      const def = current?.attributes.find((a) => a.key === k);
      return values.map((v) => ({
        key: `a-${k}-${v}`,
        label: def?.type === "boolean" ? def.label : v,
        remove: () => update({ attrs: { ...filters.attrs, [k]: values.filter((x) => x !== v) } }),
      }));
    }),
    ...(filters.min !== null || filters.max !== null
      ? [
          {
            key: "price",
            label:
              filters.min !== null && filters.max !== null
                ? `${formatCedi(filters.min)} to ${formatCedi(filters.max)}`
                : filters.min !== null
                  ? `Over ${formatCedi(filters.min)}`
                  : `Under ${formatCedi(filters.max!)}`,
            remove: () => update({ min: null, max: null }),
          },
        ]
      : []),
    ...filters.conditions.map((c) => ({ key: `c-${c}`, label: c, remove: () => update({ conditions: filters.conditions.filter((x) => x !== c) }) })),
    ...filters.pickup.map((p) => ({ key: `p-${p}`, label: p, remove: () => update({ pickup: filters.pickup.filter((x) => x !== p) }) })),
    ...(filters.sale ? [{ key: "sale", label: "Move-Out Sale", remove: () => update({ sale: false }) }] : []),
    ...(filters.deals ? [{ key: "deals", label: "Price drops", remove: () => update({ deals: false }) }] : []),
  ];

  const panel = (
    <FilterPanel all={allListings} filters={filters} update={update} replace={replace} categories={catalog.categories} current={current} labelOf={labelOf} />
  );

  return (
    <div className="container-page pt-5 sm:pt-8">
      <nav className="text-xs text-ink-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-ink-950">
          Home
        </Link>
        <span className="mx-1.5 text-ink-300">/</span>
        <Link href="/browse" className="hover:text-ink-950">
          Browse
        </Link>
        {current && (
          <>
            <span className="mx-1.5 text-ink-300">/</span>
            <span className="text-ink-950">{current.label}</span>
          </>
        )}
      </nav>

      <motion.div key={title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mt-3 flex items-center gap-3.5">
        {current && (
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface text-ink-950">
            <CategoryIcon name={current.icon} className="size-[22px]" />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-3xl">{title}</h1>
          <p className="mt-0.5 text-sm text-ink-500" aria-live="polite">
            {results.length} {results.length === 1 ? "item" : "items"}
            {current?.blurb && !filters.q && <> · {current.blurb}</>}
            {filters.q && (
              <>
                {" · "}
                <button type="button" className="font-medium text-ink-950 underline underline-offset-4" onClick={() => update({ q: "" })}>
                  Clear search
                </button>
              </>
            )}
          </p>
        </div>
      </motion.div>

      {/* Sub-category chips from the category's "type" attribute */}
      {typeAttr && (
        <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {["All", ...(typeAttr.options ?? [])].map((t) => {
            const on = t === "All" ? selectedTypes.length === 0 : selectedTypes.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => update({ attrs: { ...filters.attrs, type: t === "All" ? [] : [t] } })}
                className={cn("relative h-9 shrink-0 rounded-full px-4 text-[13px] font-medium transition-colors", on ? "text-canvas" : "bg-surface text-ink-700 hover:bg-surface-2")}
              >
                {on && <motion.span layoutId="type-chip" className="absolute inset-0 rounded-full bg-ink-950" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <span className="relative">{t}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6 grid gap-10 lg:grid-cols-[250px_1fr]">
        <aside className="hidden lg:block">
          <div className="no-scrollbar sticky top-[132px] max-h-[calc(100vh-150px)] overflow-y-auto pb-8">{panel}</div>
        </aside>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSheetOpen(true)} className={buttonClass("outline", "md", "h-10 px-3.5 text-[13px] lg:hidden")}>
              <SlidersHorizontal className="size-4" aria-hidden />
              Filters
              <AnimatePresence>
                {active > 0 && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="grid size-5 place-items-center rounded-full bg-ink-950 text-[11px] text-canvas">
                    {active}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto max-lg:hidden">
              <AnimatePresence initial={false} mode="popLayout">
                {chips.map((c) => (
                  <Chip key={c.key} label={c.label} onRemove={c.remove} />
                ))}
              </AnimatePresence>
              {chips.length > 1 && (
                <button type="button" onClick={clearAll} className="shrink-0 px-2 text-[13px] font-medium text-ink-950 underline underline-offset-4">
                  Clear all
                </button>
              )}
            </div>
            <Dropdown<SortKey> label="Sort" value={filters.sort} options={sortOptions} onChange={(sort) => update({ sort })} className="ml-auto" />
          </div>

          {chips.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 lg:hidden">
              <AnimatePresence initial={false} mode="popLayout">
                {chips.map((c) => (
                  <Chip key={c.key} label={c.label} onRemove={c.remove} />
                ))}
              </AnimatePresence>
            </div>
          )}

          {results.length > 0 ? (
            <motion.div layout className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 xl:grid-cols-4">
              <AnimatePresence mode="popLayout" initial={false}>
                {results.map((l, i) => (
                  <motion.div
                    key={l.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.02 }}
                  >
                    <ListingCard listing={l} priority={i < 4} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <EmptyState hasFilters={active > 0} onClear={clearAll} />
          )}
        </div>
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filters"
        headerAction={
          active > 0 && (
            <button type="button" onClick={clearAll} className="px-2 text-sm font-medium text-ink-950 underline underline-offset-4">
              Clear
            </button>
          )
        }
        footer={
          <button type="button" onClick={() => setSheetOpen(false)} className={buttonClass("dark", "lg", "w-full")}>
            Show {results.length} {results.length === 1 ? "item" : "items"}
          </button>
        }
      >
        {panel}
      </Sheet>
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 500, damping: 34 }}
      onClick={onRemove}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-surface pl-3 pr-2 text-[13px] text-ink-900 hover:bg-surface-2"
    >
      {label}
      <X className="size-3.5 text-ink-500" aria-label="Remove" />
    </motion.button>
  );
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center"
    >
      <motion.span initial={{ rotate: -12, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 12 }}>
        <SearchX className="size-9 text-ink-300" aria-hidden />
      </motion.span>
      <h2 className="mt-4 text-lg font-semibold text-ink-950">No matching items</h2>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{hasFilters ? "Try removing a filter or two." : "Try a different word, or one of these popular searches."}</p>
      {hasFilters ? (
        <button type="button" onClick={onClear} className={buttonClass("dark", "md", "mt-6")}>
          Clear filters
        </button>
      ) : (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {popularSearches.map((p) => (
            <Link key={p} href={`/browse?q=${encodeURIComponent(p)}`} className="rounded-lg border border-line-strong px-3 py-1.5 text-[13px] text-ink-700 hover:border-ink-900">
              {p}
            </Link>
          ))}
        </div>
      )}
    </motion.div>
  );
}
