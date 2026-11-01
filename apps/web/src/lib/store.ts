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

function commit(update: (s: State) => State) {
  const before = new Set(state.notifications.map((n) => n.id));
  state = update(state);
  persist();
  listeners.forEach((l) => l());
  for (const n of state.notifications) if (!before.has(n.id)) showSystemNotification(n);
}

let releaseTimer: ReturnType<typeof setInterval> | null = null;

/** Releases held payments whose time is up. On the backend this is a scheduled job. */
function releaseDue() {
  const hours = runtimeConfig().protection.autoReleaseHours;
  const next = M.autoRelease(state, Date.now(), hours);
  if (next !== state) commit(() => next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!releaseTimer) {
    releaseDue();
    releaseTimer = setInterval(releaseDue, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && releaseTimer) {
      clearInterval(releaseTimer);
      releaseTimer = null;
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

export const actions = {
  /** Mirrors the Supabase session; called by <AuthSync /> whenever it changes. */
  setUser(user: User | null) {
    if (state.user?.email === user?.email && state.user?.name === user?.name) return;
    commit((s) => ({ ...s, user }));
  },
  async signOut() {
    await signOutEverywhere();
    commit((s) => ({ ...s, user: null }));
  },
  toggleSaved(id: string) {
    commit((s) => ({ ...s, saved: s.saved.includes(id) ? s.saved.filter((x) => x !== id) : [...s.saved, id] }));
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

  // Listings
  saveListing(listing: Listing) {
    const isNew = !state.myListings.some((l) => l.id === listing.id);
    commit((s) => {
      const next = M.upsertListing(s, listing);
      return isNew && M.isActive(listing) ? M.alertMatches(next, listing, Date.now()) : next;
    });
  },
  setListingStatus(id: string, status: ListingStatus) {
    commit((s) => M.setListingStatus(s, id, status));
  },
  renewListing(id: string) {
    commit((s) => M.renewListing(s, id));
  },
  deleteListing(id: string) {
    commit((s) => M.deleteListing(s, id));
  },

  // Offers: the seller answers a few seconds later.
  makeOffer(listing: Listing, amount: number) {
    commit((s) => M.makeOffer(s, listing.id, amount, Date.now()));
    setTimeout(
      () =>
        commit((s) => M.answerOffer(s, listing, M.wouldAccept(amount, listing.price, runtimeConfig().offers.autoAcceptRatio), Date.now())),
      4000,
    );
  },

  // Messages: the seller replies after a short pause.
  sendMessage(listing: Listing, sellerName: string, text: string) {
    const conversationId = M.conversationIdFor(listing.id);
    commit((s) =>
      M.sendMessage(s, {
        conversationId,
        listingId: listing.id,
        sellerId: listing.sellerId,
        sellerName,
        text,
        id: uid("m"),
        now: Date.now(),
      }),
    );
    setTimeout(() => commit((s) => M.receiveMessage(s, conversationId, M.autoReply(text), uid("m"), Date.now())), 1800);
    return conversationId;
  },
  readConversation(id: string) {
    if (state.conversations.find((c) => c.id === id)?.unread) commit((s) => M.readConversation(s, id));
  },

  // Notifications
  markAllRead() {
    commit(M.markAllRead);
  },
  markRead(id: string) {
    commit((s) => M.markRead(s, id));
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
  saveSearch(search: Omit<SavedSearch, "id" | "createdAt" | "alerts">) {
    commit((s) => M.saveSearch(s, { ...search, id: uid("ss"), createdAt: Date.now(), alerts: true }));
  },
  removeSearch(id: string) {
    commit((s) => M.removeSearch(s, id));
  },
  toggleAlerts(id: string) {
    commit((s) => M.toggleAlerts(s, id));
  },
  markSearchSeen(id: string, matchIds: string[]) {
    commit((s) => M.markSearchSeen(s, id, matchIds));
  },
  reportListing(listingId: string, reason: string, details: string) {
    commit((s) => M.reportListing(s, { listingId, reason, details, at: Date.now() }));
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
