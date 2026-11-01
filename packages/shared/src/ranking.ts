import type { PlatformConfig } from "./config";
import { getSeller, type Listing } from "./seed";

/*
 * Listing rules that come from the platform config: expiry and ranking. Pure, so
 * the marketplace, the admin preview and the backend all agree.
 */

/** Days until an active listing expires, or null when listings don't expire. */
export function expiresIn(listing: Pick<Listing, "postedDaysAgo">, expiryDays: number) {
  return expiryDays > 0 ? expiryDays - listing.postedDaysAgo : null;
}

/** Marks active listings past the expiry window as "expired". */
export function withExpiry<T extends Listing>(listings: T[], expiryDays: number): T[] {
  if (expiryDays <= 0) return listings;
  return listings.map((l) =>
    (l.status ?? "active") === "active" && l.postedDaysAgo >= expiryDays ? { ...l, status: "expired" as const } : l,
  );
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Each signal as a 0 to 1 score, before weights. */
export function rankSignals(listing: Listing, config: Pick<PlatformConfig, "listings" | "featured">) {
  const window = config.listings.expiryDays || 30;
  const rating = getSeller(listing.sellerId)?.rating;
  return {
    freshness: clamp(1 - listing.postedDaysAgo / window),
    photos: clamp(listing.images.length / 4),
    popularity: clamp(Math.log1p(listing.saves * 3 + listing.views / 10) / Math.log1p(150)),
    sellerRating: rating === undefined ? 0.5 : clamp((rating - 3) / 2),
    promoted: listing.promoted ? 1 : 0,
    featured: config.featured.listingIds.includes(listing.id) ? 1 : 0,
  };
}

/** Weighted score used to order "Best match" results. Higher ranks first. */
export function rankScore(listing: Listing, config: Pick<PlatformConfig, "listings" | "featured" | "ranking">) {
  const s = rankSignals(listing, config);
  const w = config.ranking;
  return (
    s.freshness * w.freshness +
    s.photos * w.photos +
    s.popularity * w.popularity +
    s.sellerRating * w.sellerRating +
    s.promoted * w.promoted +
    s.featured * w.featured
  );
}
