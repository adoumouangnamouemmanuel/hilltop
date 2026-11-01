"use client";

import { useMemo } from "react";
import { queryListings, type ListingQuery } from "./queries";
import { useStore } from "./store";

/** Client counterpart of api.getListings, live-updating as the market refreshes and the user acts. */
export function useListings(q: ListingQuery = {}) {
  const { allListings } = useStore();
  const key = JSON.stringify(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the query is compared by value
  return useMemo(() => queryListings(allListings, q), [allListings, key]);
}
