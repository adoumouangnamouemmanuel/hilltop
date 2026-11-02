import type { Listing, ListingStatus, Seller } from "@hilltop/shared/seed";
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
const CARD_COLUMNS =
  "id, title, description, price, original_price, category, condition, attributes, pickup, stock, food, move_out, promoted_until, " +
  "status, posted_at, updated_at, views, saves, seller_id, photos";
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
    headers: { accept: "application/json", apikey: SUPABASE_KEY },
    // A slow database must never hold a page up.
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} for ${path.split("?")[0]}`);
  return res.json() as Promise<T>;
}

const emptyMarket = (): Market => ({ listings: [], sellers: [], loadedAt: 0 });

const PAGE = 1000;
const MAX_LISTINGS = 10_000;

/** Every live and sold listing, a page at a time, so none silently go missing past a fixed limit. */
async function cardPages(filter: string, init?: RequestInit) {
  const rows: CardRow[] = [];
  for (let offset = 0; offset < MAX_LISTINGS; offset += PAGE) {
    const page = await rest<CardRow[]>(
      `market_listings?select=${CARD_COLUMNS}${filter}&order=posted_at.desc,id&limit=${PAGE}&offset=${offset}`,
      init,
    );
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
  console.error(`The market has more than ${MAX_LISTINGS} listings; move browsing to database queries (audit PERF-001).`);
  return rows;
}

function build(rows: CardRow[], sellerRows: SellerRow[], ratings: RatingRow[], now: number) {
  const ratingOf = new Map(ratings.map((r) => [r.seller_id, r]));
  const sellerById = new Map(sellerRows.map((s) => [s.id, s]));
  const listings = rows.filter((r) => sellerById.has(r.seller_id)).map((r) => fromCard(r, sellerById.get(r.seller_id), now));
  const sellers = sellerRows.map((s) => toSeller(s, ratingOf.get(s.id)));
  return { listings, sellers };
}

/** Loads live and sold listings with their sellers. `init` lets the server cache the requests. */
export async function fetchMarket(init?: RequestInit): Promise<Market> {
  if (!SUPABASE_URL) return emptyMarket();
  const [rows, sellerRows, ratings] = await Promise.all([
    cardPages("", init),
    rest<SellerRow[]>(`market_sellers?select=${SELLER_COLUMNS}`, init),
    rest<RatingRow[]>("seller_ratings?select=seller_id,rating,reviews", init),
  ]);
  const now = Date.now();
  return { ...build(rows, sellerRows, ratings, now), loadedAt: now, fullAt: now };
}

const FULL_EVERY_MS = 30 * 60_000;

/**
 * Brings a market up to date: just the listings changed since it was loaded (and
 * their sellers), or everything every half hour, which also drops listings that
 * were hidden or deleted (those don't show up as changes).
 */
export async function refreshMarket(current: Market): Promise<Market> {
  const now = Date.now();
  if (!current.fullAt || now - current.fullAt > FULL_EVERY_MS) return fetchMarket();
  // A little overlap, so clock differences can't skip a change.
  const since = new Date(current.loadedAt - 60_000).toISOString();
  const changed = await cardPages(`&updated_at=gt.${since}`);
  if (!changed.length) return { ...current, loadedAt: now };
  const ids = [...new Set(changed.map((r) => r.seller_id))];
  const [sellerRows, ratings] = await Promise.all([
    rest<SellerRow[]>(`market_sellers?select=${SELLER_COLUMNS}&id=in.(${ids.join(",")})`),
    rest<RatingRow[]>(`seller_ratings?select=seller_id,rating,reviews&seller_id=in.(${ids.join(",")})`),
  ]);
  const fresh = build(changed, sellerRows, ratings, now);
  const byId = new Map(current.listings.map((l) => [l.id, l]));
  for (const l of fresh.listings) byId.set(l.id, l);
  const sellers = new Map(current.sellers.map((s) => [s.id, s]));
  for (const s of fresh.sellers) sellers.set(s.id, s);
  const listings = [...byId.values()].sort((a, b) => a.postedDaysAgo - b.postedDaysAgo);
  return { listings, sellers: [...sellers.values()], loadedAt: now, fullAt: current.fullAt };
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

export const findSeller = (id: string) => indexOf(market).sellers.get(id);
export const findMarketListing = (id: string) => indexOf(market).listings.get(id);
