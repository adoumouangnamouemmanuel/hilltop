"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchCategories } from "./api";
import { baseCategories, findCategory, type CategoryDef } from "./catalog";
import { useStore } from "./store";

// One request per page load, shared by every component that needs categories.
let cache: CategoryDef[] | null = null;
let inflight: Promise<CategoryDef[]> | null = null;

function load() {
  if (!inflight) inflight = fetchCategories().then((c) => (cache = c));
  return inflight;
}

/**
 * All categories: the built-in set (available immediately, so pages render on the server),
 * plus categories loaded from the API and ones sellers created.
 */
export function useCatalog() {
  const { customCategories, allListings } = useStore();
  const [remote, setRemote] = useState<CategoryDef[] | null>(cache);

  useEffect(() => {
    if (cache) return;
    let alive = true;
    load().then((c) => alive && setRemote(c));
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => {
    const merged = [...(remote ?? baseCategories)];
    for (const c of customCategories) if (!merged.some((m) => m.id === c.id)) merged.push(c);
    const counts: Record<string, number> = {};
    for (const l of allListings) counts[l.category] = (counts[l.category] ?? 0) + 1;
    return {
      categories: merged,
      counts,
      loading: remote === null,
      get: (id: string) => findCategory(merged, id),
    };
  }, [remote, customCategories, allListings]);
}
