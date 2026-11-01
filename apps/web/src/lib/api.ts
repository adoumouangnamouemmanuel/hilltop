import type { Listing, Seller } from "./data";
import { getMarket, getReviews } from "./market-server";
import { paginate, queryListings, type ListingQuery } from "./queries";
import { applyFilters, type Filters } from "./search";

/*
 * Server-side reads. Pages call these; the browser reads the same market through
 * hooks (use-listings.ts), with the user's own changes applied.
 */

export async function getListings(q: ListingQuery = {}): Promise<Listing[]> {
  return queryListings((await getMarket()).listings, q);
}

export async function getListing(id: string): Promise<Listing | null> {
  return (await getMarket()).listings.find((l) => l.id === id && l.status !== "draft") ?? null;
}

export async function searchListings(filters: Filters, opts: { page?: number; pageSize?: number; labelOf?: (id: string) => string } = {}) {
  const { listings } = await getMarket();
  const results = applyFilters(
    listings.filter((l) => (l.status ?? "active") === "active"),
    filters,
    opts.labelOf,
  );
  return paginate(results, opts.page ?? 1, opts.pageSize ?? 24);
}

export async function getSeller(id: string): Promise<Seller | null> {
  return (await getMarket()).sellers.find((s) => s.id === id) ?? null;
}

export async function getSellerReviews(seller: Seller) {
  return getReviews(seller);
}
