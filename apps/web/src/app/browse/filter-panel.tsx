"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import type { CategoryDef } from "@/lib/catalog";
import type { MarketFacets } from "@/lib/market-page-schema";
import type { Listing } from "@/lib/data";
import { useConfig } from "@/lib/config";
import { formatCedi } from "@/lib/format";
import { applyFilters, attributeFacet, filterableAttributes, withCategory, type Filters } from "@/lib/search";
import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/components/ui";

type Props = {
  all: Listing[];
  facets?: MarketFacets;
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  replace: (next: Filters) => void;
  categories: CategoryDef[];
  current: CategoryDef | null;
  labelOf: (id: string) => string;
};

export function FilterPanel({ all, facets, filters, update, replace, categories, current, labelOf }: Props) {
  const { conditions: conditionList, pickupSpots, events } = useConfig();
  const conditions = conditionList.map((c) => c.value);
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const count = (patch: Partial<Filters>) => applyFilters(all, { ...filters, ...patch }, labelOf).length;
  const attrs = filterableAttributes(current);

  return (
    <div className="divide-y divide-line">
      <Section title="Category">
        <CategoryList
          categories={categories}
          selected={filters.category}
          countFor={(id) => (facets ? (id ? (facets.categories[id] ?? 0) : facets.all) : count({ ...withCategory(filters, id) }))}
          onSelect={(id) => replace(withCategory(filters, id))}
        />
      </Section>

      {/* Category-specific filters, generated from the category's schema */}
      {attrs.map((a) => {
        const facet = facets ? new Map(Object.entries(facets.attrs[a.key] ?? {})) : attributeFacet(all, filters, a.key, labelOf);
        const selected = filters.attrs[a.key] ?? [];
        if (a.type === "boolean") {
          return (
            <Section key={a.key} title={a.label} compact>
              <Toggle
                label={`Only ${a.label.toLowerCase()}`}
                count={facet.get("true") ?? 0}
                checked={selected.includes("true")}
                onChange={(v) => update({ attrs: { ...filters.attrs, [a.key]: v ? ["true"] : [] } })}
              />
            </Section>
          );
        }
        // Options from the schema first, then any extra values sellers entered.
        const values = [...new Set([...(a.options ?? []), ...facet.keys()])];
        return (
          <Section key={a.key} title={a.label}>
            <OptionList
              options={values.map((v) => ({ value: v, count: facet.get(v) ?? 0 }))}
              selected={selected}
              onToggle={(v) => update({ attrs: { ...filters.attrs, [a.key]: toggle(selected, v) } })}
            />
          </Section>
        );
      })}

      <Section title="Price">
        <PriceRange
          all={applyFilters(all, { ...filters, min: null, max: null }, labelOf)}
          stats={facets?.price}
          min={filters.min}
          max={filters.max}
          onChange={(min, max) => update({ min, max })}
        />
      </Section>

      {!current?.noCondition && (
        <Section title="Condition">
          <OptionList
            options={conditions.map((c) => ({ value: c, count: facets ? (facets.conditions[c] ?? 0) : count({ conditions: [c] }) }))}
            selected={filters.conditions}
            onToggle={(v) => update({ conditions: toggle(filters.conditions, v) })}
          />
        </Section>
      )}

      <Section title="Pickup spot">
        <OptionList
          options={pickupSpots.map((p) => ({ value: p, count: facets ? (facets.pickup[p] ?? 0) : count({ pickup: [p] }) }))}
          selected={filters.pickup}
          onToggle={(v) => update({ pickup: toggle(filters.pickup, v) })}
        />
      </Section>

      <Section title="Deals" compact>
        {events.moveOut.enabled && (
          <Toggle
            label={events.moveOut.name}
            count={facets?.sale ?? count({ sale: true })}
            checked={filters.sale}
            onChange={(v) => update({ sale: v })}
          />
        )}
        <Toggle
          label="Price drops"
          count={facets?.deals ?? count({ deals: true })}
          checked={filters.deals}
          onChange={(v) => update({ deals: v })}
        />
      </Section>
    </div>
  );
}

function CategoryList({
  categories,
  selected,
  countFor,
  onSelect,
}: {
  categories: CategoryDef[];
  selected: string | null;
  countFor: (id: string | null) => number;
  onSelect: (id: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = [{ id: null as string | null, label: "All items", icon: "LayoutGrid" }, ...categories];
  const visible = expanded ? rows : rows.slice(0, 8);
  // Keep the selected category visible even when the list is collapsed.
  const pinned = !expanded && selected && !visible.some((r) => r.id === selected) ? rows.filter((r) => r.id === selected) : [];

  return (
    <div className="space-y-0.5">
      {[...visible, ...pinned].map((c) => {
        const active = selected === c.id;
        return (
          <button
            key={c.label}
            type="button"
            onClick={() => onSelect(c.id)}
            aria-pressed={active}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
              active ? "bg-surface font-medium text-ink-950" : "text-ink-700 hover:bg-surface",
            )}
          >
            {c.id ? <CategoryIcon name={c.icon} className="size-4 shrink-0 text-ink-500" /> : <span className="size-4" />}
            <span className="flex-1 truncate">{c.label}</span>
            <span className="text-xs text-ink-400 tabular">{countFor(c.id)}</span>
          </button>
        );
      })}
      {rows.length > 8 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="px-2.5 pt-1 text-[13px] font-medium text-ink-950 underline underline-offset-4"
        >
          {expanded ? "Show fewer" : `Show all ${rows.length - 1} categories`}
        </button>
      )}
    </div>
  );
}

function OptionList({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; count: number }[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Hide empty options unless picked, so the list only shows what can actually be found.
  const useful = options.filter((o) => o.count > 0 || selected.includes(o.value));
  const shown = expanded ? useful : useful.slice(0, 6);
  if (!useful.length) return <p className="px-1 text-xs text-ink-400">No options for the current results.</p>;

  return (
    <>
      {shown.map((o) => (
        <Checkbox key={o.value} label={o.value} count={o.count} checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
      ))}
      {useful.length > 6 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 px-1 text-[13px] font-medium text-ink-950 underline underline-offset-4"
        >
          {expanded ? "Show fewer" : `Show ${useful.length - 6} more`}
        </button>
      )}
    </>
  );
}

function Section({ title, children, compact }: { title: string; children: React.ReactNode; compact?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={cn("first:pt-0", compact ? "py-4" : "py-5")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-sm font-semibold text-ink-950"
        aria-expanded={open}
      >
        {title}
        <ChevronDown className={cn("size-4 text-ink-500 transition-transform", !open && "-rotate-90")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Checkbox({ label, checked, count, onChange }: { label: string; checked: boolean; count: number; onChange: () => void }) {
  return (
    <label className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-sm text-ink-700 hover:text-ink-950">
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-maroon-600 peer-focus-visible:ring-offset-2",
          checked ? "border-ink-950 bg-ink-950 text-canvas" : "border-line-strong bg-elevated",
        )}
      >
        <AnimatePresence>
          {checked && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 30 }}
            >
              <Check className="size-3" strokeWidth={3} aria-hidden />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="flex-1">{label}</span>
      <span className="text-xs text-ink-400 tabular">{count}</span>
    </label>
  );
}

function Toggle({ label, checked, count, onChange }: { label: string; checked: boolean; count?: number; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink-700">
      <span className="flex-1">
        {label}
        {count !== undefined && <span className="ml-2 text-xs text-ink-400 tabular">{count}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", checked ? "bg-ink-950" : "bg-line-strong")}
      >
        <motion.span
          className="absolute top-0.5 size-5 rounded-full bg-canvas shadow-sm"
          animate={{ left: checked ? 18 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 34 }}
        />
      </button>
    </div>
  );
}

const BUCKETS = 24;

/** Histogram of current prices with a dual-thumb slider, like flight and stay search. */
function PriceRange({
  all,
  stats,
  min,
  max,
  onChange,
}: {
  all: Listing[];
  stats?: MarketFacets["price"];
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const ceiling = useMemo(() => {
    if (stats) return stats.ceiling;
    const top = Math.max(100, ...all.map((l) => l.price));
    const step = top > 2000 ? 500 : top > 500 ? 100 : 10;
    return Math.ceil(top / step) * step;
  }, [all, stats]);
  const bars = useMemo(() => {
    if (stats) return stats.bins;
    const b = Array<number>(BUCKETS).fill(0);
    for (const l of all) b[Math.min(BUCKETS - 1, Math.floor((l.price / ceiling) * BUCKETS))]++;
    return b;
  }, [all, ceiling, stats]);
  const peak = Math.max(1, ...bars);

  const [lo, setLo] = useState(min ?? 0);
  const [hi, setHi] = useState(max ?? ceiling);
  // Follow outside changes (chips removed, filters cleared).
  const [last, setLast] = useState({ min, max, ceiling });
  if (last.min !== min || last.max !== max || last.ceiling !== ceiling) {
    setLast({ min, max, ceiling });
    setLo(min ?? 0);
    setHi(Math.min(max ?? ceiling, ceiling));
  }

  const commit = (a = lo, b = hi) => onChange(a > 0 ? a : null, b < ceiling ? b : null);
  const step = Math.max(5, Math.round(ceiling / 200 / 5) * 5);
  const pct = (v: number) => (v / ceiling) * 100;

  return (
    <div>
      <div className="flex h-14 items-end gap-[2px] px-[11px]" aria-hidden>
        {bars.map((count, i) => {
          const start = (i / BUCKETS) * ceiling;
          const inRange = start + ceiling / BUCKETS > lo && start < hi;
          return (
            <motion.span
              key={i}
              className={cn("flex-1 rounded-t-[2px]", inRange ? "bg-ink-950" : "bg-line-strong")}
              initial={false}
              animate={{ height: `${Math.max(count ? 12 : 4, (count / peak) * 100)}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          );
        })}
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-[11px] top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-line-strong" />
        <div
          className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-ink-950"
          style={{
            left: `calc(11px + ${pct(lo)}% * (100% - 22px) / 100%)`,
            right: `calc(11px + ${100 - pct(hi)}% * (100% - 22px) / 100%)`,
          }}
        />
        <input
          type="range"
          min={0}
          max={ceiling}
          step={step}
          value={lo}
          onChange={(e) => setLo(Math.min(Number(e.target.value), hi - step))}
          onPointerUp={() => commit()}
          onKeyUp={() => commit()}
          aria-label="Minimum price"
          className="range-thumb absolute inset-0 h-6 w-full"
        />
        <input
          type="range"
          min={0}
          max={ceiling}
          step={step}
          value={hi}
          onChange={(e) => setHi(Math.max(Number(e.target.value), lo + step))}
          onPointerUp={() => commit()}
          onKeyUp={() => commit()}
          aria-label="Maximum price"
          className="range-thumb absolute inset-0 h-6 w-full"
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <PriceField label="Min" value={lo} onCommit={(v) => commit(Math.min(v, hi), hi)} />
        <span className="text-ink-300" aria-hidden>
          -
        </span>
        <PriceField label="Max" value={hi} suffix={hi >= ceiling ? "+" : ""} onCommit={(v) => commit(lo, Math.max(v, lo))} />
      </div>
      <p className="mt-2 text-xs text-ink-400">{all.length ? `Most items are under ${formatCedi(medianOf(all))}` : "No prices yet"}</p>
    </div>
  );
}

function medianOf(all: Listing[]) {
  const p = all.map((l) => l.price).sort((a, b) => a - b);
  return p[Math.floor(p.length * 0.75)] ?? 0;
}

function PriceField({
  label,
  value,
  suffix = "",
  onCommit,
}: {
  label: string;
  value: number;
  suffix?: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="relative flex-1">
      <span className="pointer-events-none absolute top-1.5 left-3 text-[10px] text-ink-400">{label}</span>
      <input
        value={draft ?? `${value}${suffix}`}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
        onBlur={() => {
          if (draft !== null && draft !== "") onCommit(Number(draft));
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        inputMode="numeric"
        aria-label={`${label} price in cedis`}
        className="h-12 w-full rounded-lg border border-line-strong bg-elevated px-3 pt-3.5 text-sm text-ink-950 tabular transition-colors outline-none focus:border-ink-950"
      />
    </label>
  );
}
