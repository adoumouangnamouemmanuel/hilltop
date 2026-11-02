"use client";

import { useEffect, useSyncExternalStore } from "react";
import { readMarket, refreshMarket, setMarket, subscribeMarket } from "./market";

/** The public market, re-rendering when it refreshes. */
export function useMarket() {
  return useSyncExternalStore(subscribeMarket, readMarket, readMarket);
}

// Listings change slowly; a refresh downloads only what changed (see refreshMarket).
const REFRESH_MS = 5 * 60_000;

/** Refetches listings when the tab comes back after a while, so new items and sold ones show up. */
export function useMarketRefresh() {
  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible" || Date.now() - readMarket().loadedAt < REFRESH_MS) return;
      try {
        setMarket(await refreshMarket(readMarket()));
      } catch {}
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, []);
}
