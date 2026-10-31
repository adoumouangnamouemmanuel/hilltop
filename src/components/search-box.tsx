"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, Search, TrendingUp, X } from "lucide-react";
import { formatCedi } from "@/lib/format";
import { matchScore, popularSearches } from "@/lib/search";
import { useStore } from "@/lib/store";
import { useCatalog } from "@/lib/use-catalog";
import { CategoryIcon } from "./category-icon";
import { cn } from "./ui";

type Item =
  | { kind: "query"; value: string }
  | { kind: "category"; id: string; label: string }
  | { kind: "listing"; id: string };

export function SearchBox({ className, large = false, shortcut = false }: { className?: string; large?: boolean; shortcut?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const urlQuery = useSearchParams().get("q") ?? "";
  const { allListings, recentSearches, addRecentSearch, clearRecentSearches } = useStore();
  const [query, setQuery] = useState(urlQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const catalog = useCatalog();

  // Cmd/Ctrl+K jumps to search from anywhere.
  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shortcut]);

  // Mirror the URL when it changes underneath us (e.g. "clear search" on Browse).
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  const q = query.trim();
  const listingMatches = useMemo(
    () =>
      q
        ? allListings
            .map((l) => ({ l, s: matchScore(l, q, catalog.get(l.category).label) }))
            .filter((x) => x.s > 0)
            .sort((a, b) => b.s - a.s)
            .slice(0, 5)
            .map((x) => x.l)
        : [],
    [allListings, q, catalog],
  );
  const categoryMatches = q ? catalog.categories.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())) : [];

  const items: Item[] = q
    ? [
        { kind: "query", value: q },
        ...categoryMatches.map((c) => ({ kind: "category" as const, id: c.id, label: c.label })),
        ...listingMatches.map((l) => ({ kind: "listing" as const, id: l.id })),
      ]
    : [
        ...recentSearches.map((r) => ({ kind: "query" as const, value: r })),
        ...popularSearches.map((p) => ({ kind: "query" as const, value: p })),
      ];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Close when navigating away.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  function go(item: Item) {
    setOpen(false);
    inputRef.current?.blur();
    if (item.kind === "query") {
      addRecentSearch(item.value);
      setQuery(item.value);
      router.push(`/browse?q=${encodeURIComponent(item.value)}`);
    } else if (item.kind === "category") {
      setQuery("");
      router.push(`/browse?category=${item.id}`);
    } else {
      router.push(`/listing/${item.id}`);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && items[active]) go(items[active]);
      else if (q) go({ kind: "query", value: q });
      else router.push("/browse");
    }
  }

  const optionId = (i: number) => `${listId}-${i}`;
  let index = -1;
  const next = () => ++index;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-center gap-2.5 border transition-colors",
          large ? "h-14 rounded-2xl bg-elevated px-4 shadow-card" : "h-11 rounded-xl bg-surface px-3.5",
          open ? "border-ink-900 bg-elevated" : large ? "border-line hover:border-line-strong" : "border-transparent hover:border-line-strong",
        )}
      >
        <Search className="size-[18px] shrink-0 text-ink-500" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={large ? "What are you looking for?" : "Search phones, books, calculators..."}
          className={cn("h-full min-w-0 flex-1 bg-transparent text-ink-900 outline-none placeholder:text-ink-400", large ? "text-[15px]" : "text-sm")}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          aria-label="Search Hilltop"
          enterKeyHint="search"
        />
        {shortcut && !query && !open && (
          <kbd className="hidden shrink-0 rounded-md border border-line-strong px-1.5 py-0.5 font-sans text-[11px] text-ink-400 lg:block">Ctrl K</kbd>
        )}
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="grid size-6 place-items-center rounded-full text-ink-500 hover:bg-surface-2 hover:text-ink-900"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-elevated p-2 shadow-pop"
          >
            {q ? (
              <>
                <Row id={optionId(next())} active={active === index} onSelect={() => go({ kind: "query", value: q })}>
                  <Search className="size-4 text-ink-500" aria-hidden />
                  <span className="flex-1 truncate">
                    Search for <span className="font-medium text-ink-950">&ldquo;{q}&rdquo;</span>
                  </span>
                </Row>
                {categoryMatches.map((c) => (
                  <Row key={c.id} id={optionId(next())} active={active === index} onSelect={() => go({ kind: "category", id: c.id, label: c.label })}>
                    <CategoryIcon name={catalog.get(c.id).icon} className="size-4 text-ink-500" />
                    <span className="flex-1">
                      {c.label} <span className="text-ink-500">category</span>
                    </span>
                  </Row>
                ))}
                {listingMatches.length > 0 && <GroupLabel>Listings</GroupLabel>}
                {listingMatches.map((l) => (
                  <Row key={l.id} id={optionId(next())} active={active === index} onSelect={() => go({ kind: "listing", id: l.id })}>
                    <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-surface">
                      <Image src={l.images[0]} alt="" fill sizes="40px" className="object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink-950">{l.title}</span>
                      <span className="text-xs text-ink-500">{l.condition}</span>
                    </span>
                    <span className="text-sm font-medium tabular text-ink-950">{formatCedi(l.price)}</span>
                  </Row>
                ))}
                {listingMatches.length === 0 && categoryMatches.length === 0 && (
                  <p className="px-3 py-4 text-sm text-ink-500">No listings match yet. Press Enter to search anyway.</p>
                )}
              </>
            ) : (
              <>
                {recentSearches.length > 0 && (
                  <>
                    <div className="flex items-center justify-between pr-2">
                      <GroupLabel>Recent</GroupLabel>
                      <button type="button" onClick={clearRecentSearches} className="text-xs font-medium text-ink-500 hover:text-ink-900">
                        Clear
                      </button>
                    </div>
                    {recentSearches.map((r) => (
                      <Row key={`r-${r}`} id={optionId(next())} active={active === index} onSelect={() => go({ kind: "query", value: r })}>
                        <Clock className="size-4 text-ink-400" aria-hidden />
                        <span className="flex-1 truncate">{r}</span>
                      </Row>
                    ))}
                  </>
                )}
                <GroupLabel>Popular on campus</GroupLabel>
                {popularSearches.map((p) => (
                  <Row key={`p-${p}`} id={optionId(next())} active={active === index} onSelect={() => go({ kind: "query", value: p })}>
                    <TrendingUp className="size-4 text-ink-400" aria-hidden />
                    <span className="flex-1 truncate">{p}</span>
                  </Row>
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pb-1 pt-3 text-xs font-medium text-ink-500">{children}</p>;
}

function Row({
  id,
  active,
  onSelect,
  children,
}: {
  id: string;
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onPointerDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-700",
        active ? "bg-surface" : "hover:bg-surface",
      )}
    >
      {children}
    </div>
  );
}
