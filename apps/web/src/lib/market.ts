import type { Listing, ListingStatus, Seller } from "@hilltop/shared/seed";
import { relativeTime } from "@hilltop/shared/format";

/*
 * The public marketplace: live listings and the students selling them, read from
 * Supabase. The server loads it (cached for a minute) and hands it to the browser,
 * which refreshes it when the tab regains focus. Synchronous lookups (getSeller,
 * getListing) read the copy held here.
 */

export type Market = { listings: Listing[]; sellers: Seller[]; loadedAt: number };

export type PlatformReview = { id: string; sellerId: string; author: string; rating: number; text: string; when: string };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

const DAY = 86_400_000;

const SELLER_COLUMNS = "id, handle, name, shop_name, specialty, class_of, major, response_time, sales, verified, created_at";
const LISTING_COLUMNS =
  "id, title, description, price, original_price, category, condition, attributes, extra, pickup, stock, food, move_out, " +
  `promoted_until, status, posted_at, views, saves, seller:profiles!listings_seller_id_fkey(${SELLER_COLUMNS}), listing_photos(url, position)`;

type SellerRow = {
  id: string;
  handle: string;
  name: string;
  shop_name: string | null;
  specialty: string | null;
  class_of: number | null;
  major: string | null;
  response_time: string | null;
  sales: number;
  verified: boolean;
  created_at: string;
};

export type ListingRow = {
  id: string;
  title: string;
  description: string;
  price: number;
  original_price: number | null;
  category: string;
  condition: string | null;
  attributes: Listing["attributes"] | null;
  extra: [string, string][] | null;
  pickup: string;
  stock: number | null;
  food: Listing["food"] | null;
  move_out: boolean;
  promoted_until: string | null;
  status: string;
  posted_at: string;
  views: number;
  saves: number;
  seller: SellerRow | null;
  listing_photos: { url: string; position: number }[] | null;
};

type RatingRow = { seller_id: string; rating: number; reviews: number };

export function toListing(row: ListingRow, now = Date.now()): Listing {
  return {
    id: row.id,
    title: row.title,
    price: Number(row.price),
    originalPrice: row.original_price === null ? undefined : Number(row.original_price),
    category: row.category,
    condition: row.condition ?? undefined,
    images: [...(row.listing_photos ?? [])].sort((a, b) => a.position - b.position).map((p) => p.url),
    description: row.description,
    attributes: row.attributes ?? undefined,
    extra: row.extra?.length ? row.extra : undefined,
    sellerId: row.seller?.handle ?? "",
    pickup: row.pickup,
    postedDaysAgo: Math.max(0, Math.floor((now - Date.parse(row.posted_at)) / DAY)),
    promoted: row.promoted_until ? Date.parse(row.promoted_until) > now : undefined,
    moveOut: row.move_out || undefined,
    stock: row.stock ?? undefined,
    status: (row.status === "sold" ? "sold" : row.status === "draft" ? "draft" : "active") as ListingStatus,
    food: row.food ?? undefined,
    saves: row.saves,
    views: row.views,
  };
}

function toSeller(row: SellerRow, rating?: RatingRow): Seller {
  return {
    id: row.handle,
    profileId: row.id,
    name: row.name,
    verified: row.verified,
    shop: row.shop_name ?? undefined,
    specialty: row.specialty ?? "Ashesi student",
    classOf: row.class_of ?? undefined,
    major: row.major ?? undefined,
    rating: rating ? Number(rating.rating) : 0,
    reviews: rating?.reviews ?? 0,
    sales: row.sales,
    responseTime: row.response_time ?? "within a day",
    joined: row.created_at.slice(0, 4),
  };
}

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { accept: "application/json", apikey: SUPABASE_KEY },
    // A slow database must never hold a page up.
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} for ${path.split("?")[0]}`);
  return res.json() as Promise<T>;
}

const emptyMarket = (): Market => ({ listings: [], sellers: [], loadedAt: 0 });

/** Loads live and sold listings with their sellers. `init` lets the server cache the requests. */
export async function fetchMarket(init?: RequestInit): Promise<Market> {
  if (!SUPABASE_URL) return emptyMarket();
  const [rows, ratings] = await Promise.all([
    rest<ListingRow[]>(`listings?select=${LISTING_COLUMNS}&status=in.(active,sold)&order=posted_at.desc&limit=2000`, init),
    rest<RatingRow[]>("seller_ratings?select=seller_id,rating,reviews", init),
  ]);
  const now = Date.now();
  const ratingOf = new Map(ratings.map((r) => [r.seller_id, r]));
  const sellers = new Map<string, Seller>();
  for (const row of rows)
    if (row.seller && !sellers.has(row.seller.id)) sellers.set(row.seller.id, toSeller(row.seller, ratingOf.get(row.seller.id)));
  return { listings: rows.filter((r) => r.seller).map((r) => toListing(r, now)), sellers: [...sellers.values()], loadedAt: now };
}

/** A seller's public reviews, newest first. */
export async function fetchReviews(seller: Seller, init?: RequestInit): Promise<PlatformReview[]> {
  if (!SUPABASE_URL || !seller.profileId) return [];
  const rows = await rest<{ id: string; rating: number; body: string; created_at: string; author: { name: string } | null }[]>(
    `reviews?select=id,rating,body,created_at,author:profiles!reviews_author_id_fkey(name)&seller_id=eq.${seller.profileId}&order=created_at.desc&limit=50`,
    init,
  );
  const now = Date.now();
  return rows.map((r) => {
    // "Esi Quansah" is shown as "Esi Q."
    const [first, last] = (r.author?.name ?? "A student").split(" ");
    return {
      id: r.id,
      sellerId: seller.id,
      author: last ? `${first} ${last[0]}.` : first,
      rating: r.rating,
      text: r.body,
      when: relativeTime(Date.parse(r.created_at), now),
    };
  });
}

// The copy the app reads synchronously ------------------------------------------------

let market: Market = emptyMarket();
let seededWith: Market | null = null;
const listeners = new Set<() => void>();

export const readMarket = () => market;

/** Replaces the market and tells subscribers. */
export function setMarket(next: Market) {
  market = next;
  listeners.forEach((l) => l());
}

/**
 * Uses the market the server rendered with, before anything reads it. Called while
 * rendering, so it doesn't notify (nothing has subscribed yet).
 */
export function seedMarket(initial: Market) {
  if (seededWith === initial) return;
  seededWith = initial;
  if (initial.loadedAt >= market.loadedAt) market = initial;
}

export function subscribeMarket(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const findSeller = (id: string) => market.sellers.find((s) => s.id === id);
export const findMarketListing = (id: string) => market.listings.find((l) => l.id === id);
