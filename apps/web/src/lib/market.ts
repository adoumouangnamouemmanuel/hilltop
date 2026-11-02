import type { Listing, ListingStatus, Seller } from "@hilltop/shared/seed";
import { marketPageSchema, type MarketCursor, type MarketFacets } from "./market-page-schema";
import type { Filters } from "./search";
import { relativeTime } from "@hilltop/shared/format";

/*
 * The public marketplace: live listings and the students selling them, read from
 * Supabase. The server loads it (cached for a minute) and hands it to the browser,
 * which refreshes it when the tab regains focus: only what changed since, with a
 * full reload every half hour. Synchronous lookups (getSeller, getListing) read the
 * copy held here, through an index.
 *
 * Browsing reads card fields from the market_listings and market_sellers views
 * (short descriptions, photo lists, each seller once); a listing page reads its
 * full listing with fetchListing.
 */

export type Market = {
  error?: string;
  categoryCounts?: Record<string, number>;
  listings: Listing[];
  sellers: Seller[];
  loadedAt: number;
  /** When the whole market was last read; changes since are merged in between. */
  fullAt?: number;
};

export type PlatformReview = { id: string; sellerId: string; author: string; rating: number; text: string; when: string };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

const DAY = 86_400_000;

const SELLER_COLUMNS = "id, handle, name, shop_name, specialty, class_of, major, response_time, sales, verified, created_at";
const LISTING_COLUMNS =
  "id, revision, title, description, price, original_price, category, condition, attributes, extra, pickup, stock, food, move_out, " +
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
  revision?: number;
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

type CardRow = Omit<ListingRow, "extra" | "seller" | "listing_photos"> & { seller_id: string; updated_at: string; photos: string[] };

function fromCard(row: CardRow, seller: SellerRow | undefined, now: number): Listing {
  return toListing(
    { ...row, extra: null, seller: seller ?? null, listing_photos: row.photos.map((url, position) => ({ url, position })) },
    now,
  );
}

export function toListing(row: ListingRow, now = Date.now()): Listing {
  return {
    id: row.id,
    sellerProfileId: row.seller?.id,
    revision: row.revision,
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

/** Optional profile fields come through empty when the student hasn't filled them in; pages hide them then. */
function toSeller(row: SellerRow, rating?: RatingRow): Seller {
  return {
    id: row.handle,
    profileId: row.id,
    name: row.name,
    verified: row.verified,
    shop: row.shop_name?.trim() || undefined,
    specialty: row.specialty?.trim() ?? "",
    classOf: row.class_of ?? undefined,
    major: row.major ?? undefined,
    rating: rating ? Number(rating.rating) : 0,
    reviews: rating?.reviews ?? 0,
    sales: row.sales,
    responseTime: row.response_time ?? "",
    joined: row.created_at.slice(0, 4),
  };
}

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { accept: "application/json", "content-type": "application/json", apikey: SUPABASE_KEY },
    // A slow database must never hold a page up.
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} for ${path.split("?")[0]}`);
  return res.json() as Promise<T>;
}

const emptyMarket = (): Market => ({ listings: [], sellers: [], loadedAt: 0 });

export type MarketFilters = Omit<Partial<Filters>, "sort"> & { sort?: Filters["sort"] | "deals" } & {
  categories?: string[];
  ids?: string[];
  sellerId?: string;
  includeSold?: boolean;
  postedWithinDays?: number;
};
export type MarketPage = { listings: Listing[]; sellers: Seller[]; next: MarketCursor | null; total: number; facets: MarketFacets };
export async function fetchMarketPage(
  filters: MarketFilters = {},
  cursor: MarketCursor | null = null,
  limit = 24,
  init?: RequestInit,
): Promise<MarketPage> {
  if (!SUPABASE_URL) throw new Error("The marketplace is not configured.");
  const raw = await rest<unknown>("rpc/market_page", {
    ...init,
    method: "POST",
    body: JSON.stringify({ p_filters: filters, p_cursor: cursor, p_limit: limit }),
  });
  const page = marketPageSchema.parse(raw);
  const sellers = new Map<string, Seller>();
  const listings = page.items.flatMap((row) => {
    if (!row.seller) return [];
    sellers.set(row.seller.handle, toSeller(row.seller, row.rating ?? undefined));
    return [fromCard(row, row.seller, Date.now())];
  });
  return { listings, sellers: [...sellers.values()], next: page.next, total: page.total, facets: page.facets };
}

/** Only the initial feed is hydrated; browse, saved items and seller pages request their own bounded pages. */
export async function fetchMarket(init?: RequestInit): Promise<Market> {
  if (!SUPABASE_URL) return emptyMarket();
  const page = await fetchMarketPage({ sort: "newest" }, null, 60, init);
  const now = Date.now();
  return { listings: page.listings, sellers: page.sellers, categoryCounts: page.facets.categories, loadedAt: now, fullAt: now };
}
/** The first page is small, so refreshing reloads it rather than merging changes. */
export async function refreshMarket(): Promise<Market> {
  return fetchMarket();
}

const rememberedListings = new Map<string, Listing>();
const rememberedSellers = new Map<string, Seller>();
export function rememberMarketPage(page: Pick<MarketPage, "listings" | "sellers">) {
  for (const listing of page.listings) rememberedListings.set(listing.id, listing);
  for (const seller of page.sellers) rememberedSellers.set(seller.id, seller);
  for (const cache of [rememberedListings, rememberedSellers]) {
    while (cache.size > 500) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }
}

/**
 * Re-reads one listing after the student changed its availability (ordered it, cancelled),
 * so its page and cards update even when it's older than the first page the browser holds.
 */
export async function refreshListing(id: string) {
  const fresh = await fetchListing(id);
  if (!fresh) return;
  rememberedListings.set(id, fresh);
  const listings = market.listings.some((l) => l.id === id)
    ? market.listings.map((l) => (l.id === id ? fresh : l))
    : [...market.listings, fresh];
  setMarket({ ...market, listings });
}

/** One listing in full (description, specs), for its page. Drafts and hidden listings aren't public. */
export async function fetchListing(id: string, init?: RequestInit): Promise<Listing | null> {
  if (!SUPABASE_URL || !/^[\w-]{1,80}$/.test(id)) return null;
  const rows = await rest<ListingRow[]>(`listings?select=${LISTING_COLUMNS}&id=eq.${id}&status=in.(active,sold)&limit=1`, init);
  return rows[0]?.seller ? toListing(rows[0]) : null;
}

/** One seller's public profile by handle, read fresh so edits show without waiting for the market cache. */
export async function fetchSeller(handle: string, init?: RequestInit): Promise<Seller | null> {
  if (!SUPABASE_URL || !/^[a-z0-9-]{2,64}$/.test(handle)) return null;
  const rows = await rest<SellerRow[]>(`profiles?select=${SELLER_COLUMNS}&handle=eq.${handle}&status=eq.active&limit=1`, init);
  const row = rows[0];
  if (!row) return null;
  const ratings = await rest<RatingRow[]>(`seller_ratings?select=seller_id,rating,reviews&seller_id=eq.${row.id}`, init);
  return toSeller(row, ratings[0]);
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

// Lookups by id run for every card on a page, so they use maps built once per market.
const indexes = new WeakMap<Market, { listings: Map<string, Listing>; sellers: Map<string, Seller> }>();
function indexOf(m: Market) {
  let index = indexes.get(m);
  if (!index) {
    index = { listings: new Map(m.listings.map((l) => [l.id, l])), sellers: new Map(m.sellers.map((s) => [s.id, s])) };
    indexes.set(m, index);
  }
  return index;
}

export const findSeller = (id: string) => rememberedSellers.get(id) ?? indexOf(market).sellers.get(id);
export const findMarketListing = (id: string) => rememberedListings.get(id) ?? indexOf(market).listings.get(id);
