"use client";

import { useEffect, useRef, useState } from "react";
import { fetchMarketPage, rememberMarketPage, type MarketFilters, type MarketPage } from "./market";
import type { MarketCursor } from "./market-page-schema";

const requests = new Map<string, { at: number; promise: Promise<MarketPage> }>();
export function clearMarketRequests() {
  requests.clear();
}
function request(filters: MarketFilters, cursor: MarketCursor | null, limit: number) {
  const key = JSON.stringify([filters, cursor, limit]);
  const previous = requests.get(key);
  if (previous && Date.now() - previous.at < 30000) return previous.promise;
  const promise = fetchMarketPage(filters, cursor, limit).catch((error: unknown) => {
    requests.delete(key);
    throw error;
  });
  requests.set(key, { at: Date.now(), promise });
  const oldest = requests.keys().next().value;
  if (requests.size > 60 && oldest !== undefined) requests.delete(oldest);
  return promise;
}

/** Fetches bounded server-filtered pages; obsolete requests cannot overwrite new filters. */
export function useMarketPage(filters: MarketFilters, limit = 24) {
  const key = JSON.stringify(filters);
  // The filters the latest render showed, so a slow "load more" can't land on new filters.
  const currentKey = useRef(key);
  useEffect(() => {
    currentKey.current = key;
  }, [key]);
  const busy = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; page: MarketPage | null; loading: boolean; error: string | null }>({
    key,
    page: null,
    loading: true,
    error: null,
  });
  useEffect(() => {
    let live = true;
    // These filters were serialized from this hook's typed input, not external JSON.
    const input: MarketFilters = JSON.parse(key);
    const timer = setTimeout(() => {
      busy.current = true;
      request(input, null, limit)
        .then((page) => {
          if (!live) return;
          rememberMarketPage(page);
          setState({ key, page, loading: false, error: null });
        })
        .catch(() => {
          if (live)
            setState((old) => ({
              key,
              page: old.key === key ? old.page : null,
              loading: false,
              error: "Couldn't load listings. Check your connection and retry.",
            }));
        })
        .finally(() => {
          if (live) busy.current = false;
        });
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
      busy.current = false;
    };
  }, [key, limit, attempt]);
  const visible = state.key === key ? state : { key, page: null, loading: true, error: null };
  async function loadMore() {
    if (busy.current || !visible.page?.next) return;
    busy.current = true;
    setState((old) => ({ ...old, loading: true, error: null }));
    try {
      const page = await request(JSON.parse(key), visible.page.next, limit);
      if (currentKey.current !== key) return;
      rememberMarketPage(page);
      setState((old) => {
        if (old.key !== key) return old;
        const byId = new Map([...(old.page?.listings ?? []), ...page.listings].map((listing) => [listing.id, listing]));
        return { key, page: { ...page, listings: [...byId.values()] }, loading: false, error: null };
      });
    } catch {
      if (currentKey.current === key)
        setState((old) => ({ ...old, loading: false, error: "Couldn't load the next page. Your current results are kept. Try again." }));
    } finally {
      if (currentKey.current === key) busy.current = false;
    }
  }
  function retry() {
    clearMarketRequests();
    setState((old) => ({ ...old, loading: true, error: null }));
    setAttempt((value) => value + 1);
  }
  return { ...visible, loadMore, retry };
}
