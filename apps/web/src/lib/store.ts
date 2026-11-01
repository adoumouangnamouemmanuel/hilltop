"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getListing, type Listing, type ListingStatus } from "./data";
import { useMarket } from "./use-market";
import { runtimeConfig, useConfig } from "./config";
import { withExpiry } from "@hilltop/shared/ranking";
import * as M from "./model";
import { showSystemNotification } from "./push";
import { toast } from "./toast";
import type { PaymentPlan } from "@hilltop/shared/payments";
import { signOutEverywhere } from "./auth";
import { supabase } from "./supabase";
import * as Mine from "./mine";
import * as Social from "./social";
import { getSeller } from "./data";
import type { DisputeReason, Review, SavedSearch, State, User } from "./types";

/*
 * Client-side mock backend. State transitions live in model.ts; this file adds
 * persistence, ids, timestamps and the simulated "other side" (seller replies,
 * offer answers). Swap these actions for API calls once the backend exists.
 */

// Keep the Ashesi demo separate from state saved against the previous catalog.
const STORAGE_KEY = "hilltop-market:v5-ashesi";

const initialState = M.seedState();
let state: State = initialState;
let loaded = false;
const listeners = new Set<() => void>();
// Listings whose view was counted in this tab.
const counted = new Set<string>();

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...initialState, ...JSON.parse(raw) };
  } catch {}
}

let warnedFull = false;

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    warnedFull = false;
  } catch (e) {
    // Most likely the storage quota, usually from photos. Say so instead of failing silently.
    if (!warnedFull) {
      warnedFull = true;
      toast(
        e instanceof DOMException && e.name === "QuotaExceededError"
          ? "Storage is full. Remove some photos or drafts."
          : "Couldn't save your changes.",
      );
    }
  }
}

/** Applies a change. `silent` skips system notifications, for loading what was already there. */
function commit(update: (s: State) => State, silent = false) {
  const before = new Set(state.notifications.map((n) => n.id));
  state = update(state);
  persist();
  listeners.forEach((l) => l());
  if (!silent) for (const n of state.notifications) if (!before.has(n.id) && !n.read) showSystemNotification(n);
}

let releaseTimer: ReturnType<typeof setInterval> | null = null;

/** Releases held payments whose time is up. On the backend this is a scheduled job. */
function releaseDue() {
  const hours = runtimeConfig().protection.autoReleaseHours;
  const next = M.autoRelease(state, Date.now(), hours);
  if (next !== state) commit(() => next);
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
const POLL_MS = 20_000;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!releaseTimer) {
    releaseDue();
    releaseTimer = setInterval(releaseDue, 60_000);
  }
  if (!pollTimer) {
    // Realtime brings changes at once; this catches anything it misses.
    pollTimer = setInterval(() => document.visibilityState === "visible" && refreshSocial(), POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && releaseTimer) {
      clearInterval(releaseTimer);
      releaseTimer = null;
    }
    if (!listeners.size && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

function getSnapshot() {
  load();
  return state;
}

const getServerSnapshot = () => initialState;

/** Current state outside React, for the data layer. */
export function readState() {
  load();
  return state;
}

/** Wipes the demo back to its starting point. */
export function resetDemo() {
  commit(() => M.seedState());
}

// The signed-in student's own data starts empty and is loaded from the database.
const noMine: Pick<
  State,
  "myListings" | "saved" | "savedSearches" | "reports" | "conversations" | "offers" | "incomingOffers" | "notifications"
> = { myListings: [], saved: [], savedSearches: [], reports: [], conversations: [], offers: {}, incomingOffers: [], notifications: [] };
let mineLoadedFor: string | null = null;
let socialLoadedFor: string | null = null;
let stopWatching: (() => void) | null = null;

/** Reloads conversations, offers and notifications. The first load for an account doesn't pop up notifications. */
async function refreshSocial() {
  const profileId = state.user?.profileId;
  if (!profileId) return;
  const social = await Social.loadSocial(profileId);
  if (!social || state.user?.profileId !== profileId) return;
  const first = socialLoadedFor !== profileId;
  socialLoadedFor = profileId;
  commit((s) => ({ ...s, ...social }), first);
}

let pending: ReturnType<typeof setTimeout> | null = null;
/** Coalesces bursts of live events into one reload. */
function refreshSocialSoon() {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    refreshSocial();
  }, 300);
}

function watch(profileId: string | undefined) {
  stopWatching?.();
  stopWatching = null;
  if (profileId) stopWatching = Social.watchSocial(profileId, refreshSocialSoon);
}

/** Reloads the student's listings, saved items, searches and reports from the database. */
async function refreshMine() {
  const profileId = state.user?.profileId;
  if (!profileId) return;
  const mine = await Mine.loadMine(profileId);
  // Ignore an answer for someone who has since signed out.
  if (mine && state.user?.profileId === profileId) {
    mineLoadedFor = profileId;
    commit((s) => ({ ...s, ...mine }));
  }
}

/** Shows a database error and reloads, undoing an optimistic change. */
function failed(message: string | null) {
  if (!message) return;
  toast(message);
  refreshMine();
}

const me = () => state.user?.profileId;

export const actions = {
  /** Mirrors the Supabase session; called by <AuthSync /> whenever it changes. */
  setUser(user: User | null) {
    const switched = state.user?.profileId !== user?.profileId;
    const same = !switched && state.user?.email === user?.email && state.user?.name === user?.name;
    if (!same) commit((s) => ({ ...s, user, ...(switched ? noMine : {}) }), true);
    if (switched) {
      mineLoadedFor = null;
      socialLoadedFor = null;
      watch(user?.profileId);
    }
    if (user?.profileId && mineLoadedFor !== user.profileId) refreshMine();
    if (user?.profileId && socialLoadedFor !== user.profileId) refreshSocial();
  },
  refreshMine,
  refreshSocial,
  async signOut() {
    await signOutEverywhere();
    watch(undefined);
    commit((s) => ({ ...s, user: null, ...noMine }), true);
  },
  toggleSaved(id: string) {
    const saving = !state.saved.includes(id);
    commit((s) => ({ ...s, saved: saving ? [...s.saved, id] : s.saved.filter((x) => x !== id) }));
    const profileId = me();
    if (profileId) Mine.setSavedRemote(profileId, id, saving).then(failed);
  },

  // Orders
  placeOrder(input: { listing: Listing; quantity?: number; unitPrice?: number; plan: PaymentPlan; slot?: string }) {
    const id = `ord-${Math.floor(1000 + Math.random() * 9000)}`;
    commit((s) =>
      M.placeOrder(s, {
        id,
        listing: input.listing,
        quantity: input.quantity ?? 1,
        unitPrice: input.unitPrice ?? input.listing.price,
        payment: { kind: input.plan.kind, paidInApp: input.plan.payNow, dueAtPickup: input.plan.atPickup, fee: input.plan.fee },
        slot: input.slot,
        now: Date.now(),
      }),
    );
    return state.orders.find((o) => o.id === id)!;
  },
  markReady(orderId: string) {
    commit((s) => M.markReady(s, orderId, Date.now()));
  },
  markHandedOver(orderId: string) {
    commit((s) => M.markHandedOver(s, orderId, Date.now()));
  },
  confirmCollection(orderId: string) {
    commit((s) => M.confirmCollection(s, orderId, Date.now()));
  },
  openDispute(orderId: string, reason: DisputeReason, details: string) {
    commit((s) => M.openDispute(s, orderId, reason, details, Date.now()));
  },
  withdrawDispute(orderId: string) {
    commit((s) => M.withdrawDispute(s, orderId, Date.now()));
  },
  resolveDispute(orderId: string, outcome: "refunded" | "released") {
    commit((s) => M.resolveDispute(s, orderId, outcome, Date.now()));
  },
  addReview(r: Omit<Review, "id" | "at" | "author">) {
    commit((s) => M.addReview(s, { ...r, id: uid("rev"), at: Date.now(), author: s.user?.name ?? "You" }));
  },

  // Listings: photos are uploaded first, then the listing and its photos are saved.
  async saveListing(listing: Listing): Promise<{ listing: Listing } | { error: string }> {
    const { profileId, handle } = state.user ?? {};
    if (!profileId || !handle) return { error: "Sign in to sell." };
    const isNew = !state.myListings.some((l) => l.id === listing.id);
    let images: string[];
    try {
      images = await Mine.uploadPhotos(listing.images);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "A photo didn't upload. Try again." };
    }
    const saved = { ...listing, images, sellerId: handle };
    const error = await Mine.saveListingRemote(saved, profileId, isNew);
    if (error) return { error };
    commit((s) => M.upsertListing(s, saved));
    return { listing: saved };
  },
  setListingStatus(id: string, status: ListingStatus) {
    commit((s) => M.setListingStatus(s, id, status));
    Mine.setListingStatusRemote(id, status).then(failed);
  },
  renewListing(id: string) {
    commit((s) => M.renewListing(s, id));
    Mine.renewListingRemote(id).then(failed);
  },
  deleteListing(id: string) {
    commit((s) => M.deleteListing(s, id));
    Mine.deleteListingRemote(id).then(failed);
  },

  // Offers: the seller is notified and answers from the listing page.
  async makeOffer(listing: Listing, amount: number) {
    const profileId = me();
    if (!profileId) return "Sign in to make an offer.";
    const error = await Social.makeOfferRemote(profileId, listing.id, amount);
    if (!error) commit((s) => M.makeOffer(s, listing.id, amount, Date.now()));
    return error;
  },
  async answerOffer(offerId: string, accepted: boolean) {
    commit((s) => ({
      ...s,
      incomingOffers: s.incomingOffers?.map((o) => (o.id === offerId ? { ...o, status: accepted ? "accepted" : "declined" } : o)),
    }));
    const error = await Social.answerOfferRemote(offerId, accepted);
    if (error) toast(error);
    refreshSocial();
    return error;
  },

  // Messages. `conversationId` is known when replying in the inbox.
  async sendMessage(listing: Listing, sellerName: string, text: string, conversationId?: string) {
    const profileId = me();
    if (!profileId) return null;
    const existing =
      state.conversations.find((c) => c.id === conversationId) ??
      state.conversations.find((c) => c.listingId === listing.id && c.role !== "selling");
    const tempId = existing?.id ?? uid("c");
    commit((s) =>
      M.sendMessage(s, {
        conversationId: tempId,
        listingId: listing.id,
        sellerId: listing.sellerId,
        sellerName,
        text,
        id: uid("m"),
        now: Date.now(),
      }),
    );
    const result = await Social.sendMessageRemote(
      profileId,
      { id: listing.id, sellerProfileId: getSeller(listing.sellerId)?.profileId ?? "" },
      existing?.id,
      text,
    );
    if ("error" in result) {
      toast(result.error);
      refreshSocial();
      return null;
    }
    // A new conversation gets its real id.
    if (result.conversationId !== tempId) {
      commit((s) => ({ ...s, conversations: s.conversations.map((c) => (c.id === tempId ? { ...c, id: result.conversationId } : c)) }));
    }
    return result.conversationId;
  },
  readConversation(id: string) {
    if (!state.conversations.find((c) => c.id === id)?.unread) return;
    commit((s) => M.readConversation(s, id));
    const profileId = me();
    if (profileId) Social.readConversationRemote(profileId, id);
  },

  // Notifications
  markAllRead() {
    commit(M.markAllRead);
    Social.markReadRemote();
  },
  markRead(id: string) {
    commit((s) => M.markRead(s, id));
    Social.markReadRemote(id);
  },

  // Search
  addRecentSearch(query: string) {
    const q = query.trim();
    if (!q) return;
    commit((s) => ({ ...s, recentSearches: [q, ...s.recentSearches.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 5) }));
  },
  clearRecentSearches() {
    commit((s) => ({ ...s, recentSearches: [] }));
  },
  async saveSearch(search: Omit<SavedSearch, "id" | "createdAt" | "alerts">) {
    const profileId = me();
    if (!profileId || state.savedSearches.some((x) => x.query === search.query)) return;
    const created = await Mine.saveSearchRemote(profileId, search);
    if (!created) return toast("Couldn't save this search. Try again.");
    commit((s) => M.saveSearch(s, { ...search, ...created, alerts: true }));
  },
  removeSearch(id: string) {
    commit((s) => M.removeSearch(s, id));
    Mine.removeSearchRemote(id);
  },
  toggleAlerts(id: string) {
    commit((s) => M.toggleAlerts(s, id));
    const search = state.savedSearches.find((x) => x.id === id);
    if (search) Mine.updateSearchRemote(id, { alerts: search.alerts });
  },
  markSearchSeen(id: string, matchIds: string[]) {
    const search = state.savedSearches.find((x) => x.id === id);
    if (!search || search.seenIds.join() === matchIds.join()) return;
    commit((s) => M.markSearchSeen(s, id, matchIds));
    Mine.updateSearchRemote(id, { seen_ids: matchIds });
  },
  reportListing(listingId: string, reason: string, details: string) {
    commit((s) => M.reportListing(s, { listingId, reason, details, at: Date.now() }));
    const profileId = me();
    if (profileId) Mine.reportRemote(profileId, { listingId, reason, details }).then(failed);
  },
  recordView(id: string) {
    if (state.recentlyViewed[0] !== id) commit((s) => M.recordView(s, id));
    if (!counted.has(id)) {
      counted.add(id);
      supabase()
        ?.from("listing_views")
        .insert({ listing_id: id })
        .then(() => {});
    }
  },
};

export function useStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const market = useMarket();
  const { expiryDays } = useConfig().listings;
  // Expiry is derived from the configured window, so changing it in the admin applies at once.
  const allListings = useMemo(
    () => withExpiry(M.mergeListings(market.listings, snapshot), expiryDays),
    [market.listings, snapshot, expiryDays],
  );
  const myListings = useMemo(() => withExpiry(snapshot.myListings, expiryDays), [snapshot.myListings, expiryDays]);
  const activeListings = useMemo(() => allListings.filter(M.isActive), [allListings]);
  return { ...snapshot, ...actions, myListings, allListings, activeListings };
}

/** A listing by id, including the user's own and with their changes applied. */
export function findListing(all: Listing[], id: string) {
  return all.find((l) => l.id === id) ?? getListing(id);
}
