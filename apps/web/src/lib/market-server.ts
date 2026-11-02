import { fetchListing, fetchMarket, fetchReviews, fetchSeller, type Market, type PlatformReview } from "./market";
import type { Listing, Seller } from "@hilltop/shared/seed";

/** How often the server refetches listings, in seconds. Pages are regenerated on the same schedule. */
const REFRESH_SECONDS = 60;

const cached: RequestInit = { next: { revalidate: REFRESH_SECONDS } } as RequestInit;

/** The public marketplace, cached on the server. An unreachable database shows an empty market rather than an error. */
export async function getMarket(): Promise<Market> {
  try {
    return await fetchMarket(cached);
  } catch (e) {
    console.error("Couldn't load listings", e);
    return { listings: [], sellers: [], loadedAt: 0, error: "Listings are temporarily unavailable. Check your connection and retry." };
  }
}

export async function getReviews(seller: Seller): Promise<PlatformReview[]> {
  return fetchReviews(seller, cached);
}

/** Failed requests propagate to the route error boundary; only real misses return null. */
export async function getFullListing(id: string): Promise<Listing | null> {
  return fetchListing(id, cached);
}

export async function getSellerProfile(handle: string): Promise<Seller | null> {
  return fetchSeller(handle, cached);
}
