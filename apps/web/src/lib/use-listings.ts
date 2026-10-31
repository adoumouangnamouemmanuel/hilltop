"use client";

import { useMemo } from "react";
import { registerListingSource } from "./api";
import { listings as seedListings } from "./data";
import { mergeListings } from "./model";
import { queryListings, type ListingQuery } from "./queries";
import { readState, useStore } from "./store";

// In the browser, API reads include the user's own listings and changes.
registerListingSource(() => mergeListings(seedListings, readState()));

/** Client counterpart of api.getListings, live-updating as the user acts. */
export function useListings(q: ListingQuery = {}) {
  const { allListings } = useStore();
  const key = JSON.stringify(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the query is compared by value
  return useMemo(() => queryListings(allListings, q), [allListings, key]);
}
