"use client";

import { useMemo } from "react";
import { visibleCategories } from "@hilltop/shared/config";
import { findCategory } from "./catalog";
import { useConfig } from "./config";
import { useStore } from "./store";

/**
 * All categories shoppers can see: the catalog from the platform config (edited in
 * the admin portal), plus categories sellers created.
 */
export function useCatalog() {
  const config = useConfig();
  const { customCategories, allListings } = useStore();

  return useMemo(() => {
    const merged = [...visibleCategories(config)];
    if (config.features.sellerCategories) for (const c of customCategories) if (!merged.some((m) => m.id === c.id)) merged.push(c);
    const counts: Record<string, number> = {};
    for (const l of allListings) counts[l.category] = (counts[l.category] ?? 0) + 1;
    return {
      categories: merged,
      counts,
      // Looks up hidden categories too, so existing listings still render.
      get: (id: string) => findCategory([...merged, ...config.categories], id),
    };
  }, [config, customCategories, allListings]);
}
