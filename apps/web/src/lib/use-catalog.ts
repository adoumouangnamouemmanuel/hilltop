"use client";

import { useMemo } from "react";
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
