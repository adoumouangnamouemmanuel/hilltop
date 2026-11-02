import { fetchMarket, fetchReviews, fetchSeller, type Market, type PlatformReview } from "./market";
import type { Seller } from "@hilltop/shared/seed";

/** How often the server refetches listings, in seconds. Pages are regenerated on the same schedule. */
const REFRESH_SECONDS = 60;

const cached: RequestInit = { next: { revalidate: REFRESH_SECONDS } } as RequestInit;

/** The public marketplace, cached on the server. An unreachable database shows an empty market rather than an error. */
export async function getMarket(): Promise<Market> {
  try {
    return await fetchMarket(cached);
  } catch (e) {
    console.error("Couldn't load listings", e);
    return { listings: [], sellers: [], loadedAt: 0 };
  }
}

export async function getReviews(seller: Seller): Promise<PlatformReview[]> {
  try {
    return await fetchReviews(seller, cached);
  } catch {
    return [];
  }
}

/** A seller with nothing live right now isn't in the market, but still has a public page. */
export async function getSellerProfile(handle: string): Promise<Seller | null> {
  try {
    return await fetchSeller(handle, cached);
  } catch {
    return null;
  }
}
