import type { Listing } from "./data";
import { isActive } from "./model";

/** Simple listing queries shared by the API layer (server) and hooks (client). */
export type ListingQuery = {
  category?: string;
  categories?: string[];
  sellerId?: string;
  ids?: string[];
  maxPrice?: number;
  postedWithinDays?: number;
  moveOut?: boolean;
  deals?: boolean;
  sort?: "popular" | "newest" | "price-asc" | "deals";
  limit?: number;
  /** Include sold listings (drafts are never included). */
  includeSold?: boolean;
};

export function queryListings(all: Listing[], q: ListingQuery = {}): Listing[] {
  let out = all.filter((l) => (q.includeSold ? l.status !== "draft" : isActive(l)));
  if (q.category) out = out.filter((l) => l.category === q.category);
  if (q.categories) out = out.filter((l) => q.categories!.includes(l.category));
  if (q.sellerId) out = out.filter((l) => l.sellerId === q.sellerId);
  if (q.ids) out = q.ids.map((id) => out.find((l) => l.id === id)).filter((l): l is Listing => !!l);
  if (q.maxPrice !== undefined) out = out.filter((l) => l.price <= q.maxPrice!);
  if (q.postedWithinDays !== undefined) out = out.filter((l) => l.postedDaysAgo <= q.postedWithinDays!);
  if (q.moveOut) out = out.filter((l) => l.moveOut);
  if (q.deals) out = out.filter((l) => l.originalPrice && l.originalPrice > l.price);

  const sorted = [...out];
  if (q.sort === "popular") sorted.sort((a, b) => Number(!!b.promoted) - Number(!!a.promoted) || b.saves - a.saves);
  if (q.sort === "newest") sorted.sort((a, b) => a.postedDaysAgo - b.postedDaysAgo);
  if (q.sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
  if (q.sort === "deals") sorted.sort((a, b) => b.originalPrice! - b.price - (a.originalPrice! - a.price));
  return q.limit ? sorted.slice(0, q.limit) : sorted;
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const end = page * pageSize;
  return { items: items.slice(0, end), total: items.length, hasMore: end < items.length };
}
