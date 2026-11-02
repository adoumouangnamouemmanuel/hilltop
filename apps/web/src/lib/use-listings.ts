"use client";

import { queryListings, type ListingQuery } from "./queries";
import { useStore } from "./store";
import { useMarketPage } from "./use-market-page";
import type { MarketFilters } from "./market";

export function listingFilters(query: ListingQuery): MarketFilters {
  return {
    category: query.category,
    categories: query.categories,
    sellerId: query.sellerId,
    ids: query.ids,
    max: query.maxPrice,
    postedWithinDays: query.postedWithinDays,
    sale: query.moveOut,
    deals: query.deals,
    includeSold: query.includeSold,
    sort: query.sort ?? "newest",
  };
}
export function useListingPage(query: ListingQuery = {}) {
  return useMarketPage(listingFilters(query), Math.min(100, query.limit ?? 24));
}
/** Rails intentionally fetch one bounded page; full lists expose continuation controls. */
export function useListings(query: ListingQuery = {}) {
  const { allListings } = useStore();
  const { page } = useListingPage(query);
  const rows = page?.listings ?? queryListings(allListings, query);
  const ordered = query.ids ? query.ids.flatMap((id) => rows.filter((row) => row.id === id)) : rows;
  return query.limit ? ordered.slice(0, query.limit) : ordered;
}
