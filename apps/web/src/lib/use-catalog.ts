"use client";

import { useMemo } from "react";
import type { CategoryDef as Category } from "@hilltop/shared/catalog";
import { visibleCategories } from "@hilltop/shared/config";
import { findCategory } from "./catalog";
import { useConfig } from "./config";
import { useStore } from "./store";

/**
 * All categories shoppers can see. They come only from the platform config, which
 * is edited in the admin portal; sellers can't create categories.
 */
export function useCatalog() {
  const config = useConfig();
  const { allListings } = useStore();

  return useMemo(() => {
    const visible = visibleCategories(config);
    const counts: Record<string, number> = {};
    for (const l of allListings) counts[l.category] = (counts[l.category] ?? 0) + 1;
    return {
      categories: visible,
      counts,
      // Looks up hidden categories too, so existing listings still render.
      get: (id: string) => findCategory(config.categories, id),
    };
  }, [config, allListings]);
}

export type Signals = {
  /** Listing ids, newest first. */
  viewed: string[];
  saved: string[];
  ordered: string[];
  /** Search words, newest first. */
  searches: string[];
};

/**
 * Categories in the order this student is most likely to want: what they ordered,
 * saved, viewed and searched for, newest counting most. Categories they haven't shown
 * interest in keep the catalogue's order after them.
 */
export function personalOrder(categories: Category[], signals: Signals, categoryOf: (listingId: string) => string | undefined) {
  const score = new Map<string, number>();
  const add = (id: string | undefined, points: number) => id && score.set(id, (score.get(id) ?? 0) + points);
  signals.ordered.forEach((id) => add(categoryOf(id), 4));
  signals.saved.forEach((id) => add(categoryOf(id), 2));
  // Newer views count more: 3 for the latest, fading to 1.
  signals.viewed.forEach((id, i) => add(categoryOf(id), Math.max(1, 3 - i * 0.25)));
  signals.searches.forEach((q, i) => {
    const words = q
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    for (const c of categories) {
      const name = `${c.id} ${c.label}`.toLowerCase();
      if (words.some((w) => name.includes(w))) add(c.id, Math.max(1, 2 - i * 0.25));
    }
  });
  return categories
    .map((c, i) => ({ c, i, s: score.get(c.id) ?? 0 }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}

// Decided once per visit, so the bar doesn't reshuffle while someone browses.
const frozen = new Map<string, string[]>();

/** The visible categories, ordered for the current visitor (after hydration; the server renders the default order). */
export function usePersonalCategories() {
  const { categories } = useCatalog();
  const { user, recentlyViewed, saved, orders, recentSearches, allListings } = useStore();
  const who = user?.profileId ?? "visitor";
  const hasSignals = recentlyViewed.length + saved.length + orders.length + recentSearches.length > 0;

  // The server and the first render in the browser have no history, so they agree.
  const ids = useMemo(() => {
    const decided = frozen.get(who);
    if (decided) return decided;
    if (!hasSignals || !allListings.length) return null;
    const category = new Map(allListings.map((l) => [l.id, l.category]));
    const ordered = personalOrder(
      categories,
      {
        viewed: recentlyViewed,
        saved,
        ordered: orders.filter((o) => o.role === "buying").map((o) => o.listingId),
        searches: recentSearches,
      },
      (id) => category.get(id),
    ).map((c) => c.id);
    frozen.set(who, ordered);
    return ordered;
  }, [who, hasSignals, allListings, categories, recentlyViewed, saved, orders, recentSearches]);

  return useMemo(() => {
    if (!ids) return categories;
    const rank = new Map(ids.map((id, i) => [id, i]));
    return [...categories].sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
  }, [categories, ids]);
}
