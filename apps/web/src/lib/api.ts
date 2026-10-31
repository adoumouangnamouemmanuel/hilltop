import { getSeller as seedSeller, listings as seedListings, reviews as seedReviews, type Listing, type Seller } from "./data";
import { paginate, queryListings, type ListingQuery } from "./queries";
import { applyFilters, type Filters } from "./search";

/*
 * The data layer. Every read in the app goes through these functions (on the
 * server) or through the same query functions via hooks (on the client). When
 * the backend exists, only this file changes: replace the bodies with fetch calls.
 * Platform settings (fees, categories...) come from the admin portal; see config-server.ts.
 */

type ListingSource = () => Listing[];

// On the server this is the platform data. In the browser the mock store registers
// a source that also includes the user's own listings and changes.
let source: ListingSource = () => seedListings;

export function registerListingSource(fn: ListingSource) {
  source = fn;
}

export async function getListings(q: ListingQuery = {}): Promise<Listing[]> {
  return queryListings(source(), q);
}

export async function getListing(id: string): Promise<Listing | null> {
  return source().find((l) => l.id === id && l.status !== "draft") ?? null;
}

export async function searchListings(filters: Filters, opts: { page?: number; pageSize?: number; labelOf?: (id: string) => string } = {}) {
  const results = applyFilters(
    source().filter((l) => (l.status ?? "active") === "active"),
    filters,
    opts.labelOf,
  );
  return paginate(results, opts.page ?? 1, opts.pageSize ?? 24);
}

export async function getSeller(id: string): Promise<Seller | null> {
  return seedSeller(id) ?? null;
}

export async function getSellerReviews(id: string) {
  return seedReviews.filter((r) => r.sellerId === id);
}
