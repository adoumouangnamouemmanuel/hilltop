"use client";

import type { Listing, ListingStatus } from "./data";
import { toListing, type ListingRow } from "./market";
import { supabase } from "./supabase";
import type { ListingReport, SavedSearch } from "./types";

/*
 * What belongs to the signed-in student, in the database: their listings (any
 * status) and photos, saved items, saved searches and reports. Row-level security
 * limits every query here to their own rows.
 */

const LISTING_COLUMNS =
  "id, title, description, price, original_price, category, condition, attributes, extra, pickup, stock, food, move_out, " +
  "promoted_until, status, posted_at, views, saves, seller:profiles!listings_seller_id_fkey(id, handle, name, shop_name, specialty, class_of, major, response_time, sales, verified, created_at), listing_photos(url, position)";

export type Mine = {
  myListings: Listing[];
  saved: string[];
  savedSearches: SavedSearch[];
  reports: ListingReport[];
};

/** Turns a database error into words for a toast. */
export function problem(error: { message?: string; code?: string } | null | undefined, fallback: string) {
  if (!error) return null;
  // Rule violations raised by the database are written for students.
  if (error.code === "23514" && error.message && !/violates check constraint/.test(error.message)) return error.message;
  if (error.code === "42501") return "You don't have permission to do that.";
  return fallback;
}

export async function loadMine(profileId: string): Promise<Mine | null> {
  const client = supabase();
  if (!client) return null;
  const [listings, saved, searches, reports] = await Promise.all([
    client.from("listings").select(LISTING_COLUMNS).eq("seller_id", profileId).order("updated_at", { ascending: false }),
    client.from("saved_listings").select("listing_id, created_at").order("created_at", { ascending: false }),
    client.from("saved_searches").select("id, label, query, alerts, seen_ids, created_at").order("created_at", { ascending: false }),
    client.from("reports").select("listing_id, reason, details, created_at").eq("reporter_id", profileId),
  ]);
  if (listings.error || saved.error || searches.error || reports.error) return null;
  const now = Date.now();
  return {
    myListings: (listings.data as unknown as ListingRow[]).map((r) => toListing(r, now)),
    saved: saved.data.map((r) => r.listing_id),
    savedSearches: searches.data.map((r) => ({
      id: r.id,
      label: r.label,
      query: r.query,
      alerts: r.alerts,
      seenIds: r.seen_ids,
      createdAt: Date.parse(r.created_at),
    })),
    reports: reports.data.map((r) => ({ listingId: r.listing_id, reason: r.reason, details: r.details, at: Date.parse(r.created_at) })),
  };
}

// Photos -------------------------------------------------------------------------------

async function uploadOne(dataUrl: string, token: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const res = await fetch("/api/photos", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: blob });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error ?? "A photo didn't upload. Try again.");
  return body.url;
}

/** Uploads photos that are still in the browser (data URLs); ones already online are kept. */
export async function uploadPhotos(images: string[]): Promise<string[]> {
  const client = supabase();
  const token = (await client?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new Error("Sign in again to add photos.");
  return Promise.all(images.map((src) => (src.startsWith("data:") ? uploadOne(src, token) : src)));
}

// Listings -----------------------------------------------------------------------------

/** A readable, unique id for a new listing: "casio-fx-991es-3f9a1c". */
export function listingIdFor(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  const random = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${slug || "item"}-${random}`;
}

const dbStatus = (s: ListingStatus | undefined) =>
  (s === "draft" ? "draft" : s === "sold" ? "sold" : "active") as "draft" | "sold" | "active";

/** Creates or updates a listing and its photos. Returns an error message, or null. */
export async function saveListingRemote(listing: Listing, profileId: string, isNew: boolean): Promise<string | null> {
  const client = supabase();
  if (!client) return "Selling isn't available right now.";
  const fields = {
    title: listing.title,
    description: listing.description,
    price: listing.price,
    original_price: listing.originalPrice ?? null,
    category: listing.category,
    condition: listing.condition ?? null,
    attributes: listing.attributes ?? {},
    extra: listing.extra ?? [],
    pickup: listing.pickup,
    stock: listing.stock ?? null,
    food: listing.food ?? null,
    move_out: !!listing.moveOut,
    status: dbStatus(listing.status),
  };
  const write = isNew
    ? await client.from("listings").insert({ id: listing.id, seller_id: profileId, ...fields })
    : await client.from("listings").update(fields).eq("id", listing.id);
  const failed = problem(write.error, "Couldn't save your listing. Try again.");
  if (failed) return failed;

  // Photos are replaced as a set, in the order the seller arranged them.
  const removed = await client.from("listing_photos").delete().eq("listing_id", listing.id);
  if (removed.error) return "Couldn't save your photos. Try again.";
  if (listing.images.length) {
    const added = await client
      .from("listing_photos")
      .insert(listing.images.map((url, position) => ({ listing_id: listing.id, url, position })));
    if (added.error) return "Couldn't save your photos. Try again.";
  }
  return null;
}

export async function setListingStatusRemote(id: string, status: ListingStatus) {
  const { error } =
    (await supabase()
      ?.from("listings")
      .update({ status: dbStatus(status) })
      .eq("id", id)) ?? {};
  return problem(error, "Couldn't update the listing.");
}

/** Moves a listing back to the top and makes it live again. The database sets the time. */
export async function renewListingRemote(id: string) {
  const { error } =
    (await supabase()?.from("listings").update({ status: "active", posted_at: new Date().toISOString() }).eq("id", id)) ?? {};
  return problem(error, "Couldn't renew the listing.");
}

export async function deleteListingRemote(id: string) {
  const { error } = (await supabase()?.from("listings").delete().eq("id", id)) ?? {};
  return problem(error, "Couldn't delete the listing.");
}

// Saved items, searches and reports ---------------------------------------------------------

export async function setSavedRemote(profileId: string, listingId: string, saved: boolean) {
  const client = supabase();
  if (!client) return null;
  const { error } = saved
    ? await client.from("saved_listings").insert({ profile_id: profileId, listing_id: listingId })
    : await client.from("saved_listings").delete().eq("listing_id", listingId);
  // Saving twice (another tab) is fine.
  return error && error.code !== "23505" ? "Couldn't update your saved items." : null;
}

export async function saveSearchRemote(profileId: string, search: Pick<SavedSearch, "label" | "query" | "seenIds">) {
  const { data, error } =
    (await supabase()
      ?.from("saved_searches")
      .insert({ profile_id: profileId, label: search.label, query: search.query, seen_ids: search.seenIds })
      .select("id, created_at")
      .single()) ?? {};
  return error || !data ? null : { id: data.id, createdAt: Date.parse(data.created_at) };
}

export async function updateSearchRemote(id: string, patch: { alerts?: boolean; seen_ids?: string[] }) {
  await supabase()?.from("saved_searches").update(patch).eq("id", id);
}

export async function removeSearchRemote(id: string) {
  await supabase()?.from("saved_searches").delete().eq("id", id);
}

export async function reportRemote(profileId: string, r: Omit<ListingReport, "at">) {
  const { error } =
    (await supabase()?.from("reports").insert({ reporter_id: profileId, listing_id: r.listingId, reason: r.reason, details: r.details })) ??
    {};
  return error && error.code !== "23505" ? "Couldn't send your report. Try again." : null;
}
