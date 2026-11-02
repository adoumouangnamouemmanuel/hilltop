"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getListing, type Listing, type ListingStatus } from "./data";
import { useMarket } from "./use-market";
import { runtimeConfig, useConfig } from "./config";
import { withExpiry } from "@hilltop/shared/ranking";
import * as M from "./model";
import { forgetPushSubscription, showSystemNotification, syncPushSubscription } from "./push";
import { toast } from "./toast";
import { signOutEverywhere } from "./auth";
import { supabase } from "./supabase";
import * as Mine from "./mine";
import * as Social from "./social";
import * as Orders from "./orders";
import { refreshListing, refreshMarket, setMarket } from "./market";
import { getSeller } from "./data";
import type { DisputeReason, Order, OrderStatus, Review, SavedSearch, State, User } from "./types";
/** Client state mirrors authorized database operations; private data stays in memory. */
const STORAGE_KEY = "hilltop-history:v1";

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
    localStorage.removeItem("hilltop-market:v5-ashesi");
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (parsed && typeof parsed === "object" && "recentlyViewed" in parsed && "recentSearches" in parsed) {
      const strings = (value: unknown) =>
        Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length <= 100).slice(0, 20) : [];
      state = { ...initialState, recentlyViewed: strings(parsed.recentlyViewed), recentSearches: strings(parsed.recentSearches) };
    }
  } catch {}
}

let warnedFull = false;

function persist() {
  try {
    if (state.user) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify({ recentlyViewed: state.recentlyViewed, recentSearches: state.recentSearches }));
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
  if (!silent) for (const n of state.notifications) if (!before.has(n.id) && !n.read) void showSystemNotification(n).catch(() => {});
}

let releaseTimer: ReturnType<typeof setInterval> | null = null;

/** Releases held payments whose time is up. On the backend this is a scheduled job. */
function releaseDue() {
  const hours = runtimeConfig().protection.autoReleaseHours;
  const next = M.autoRelease(state, Date.now(), hours);
  if (next !== state) commit(() => next);
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
const POLL_MS = 15_000;
// Without Realtime, polls start every 30 seconds and slow to every 2 minutes while
// the tab sits idle; coming back to the tab starts over.
const IDLE_POLL_MS = [30_000, 60_000, 120_000];
// With Realtime connected, polling is only a safety net.
const LIVE_POLL_MS = 180_000;
let live = false;
let lastSocial = 0;
let idlePolls = 0;

/** Polls unless Realtime is delivering changes and the last load is recent. */
function pollSocial() {
  if (document.visibilityState !== "visible") return;
  const wait = live ? LIVE_POLL_MS : IDLE_POLL_MS[Math.min(idlePolls, IDLE_POLL_MS.length - 1)];
  if (Date.now() - lastSocial < wait) return;
  idlePolls++;
  refreshSocial();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") idlePolls = 0;
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!releaseTimer) {
    releaseDue();
    releaseTimer = setInterval(releaseDue, 60_000);
  }
  if (!pollTimer) {
    // Realtime brings changes at once; this catches anything it misses.
    pollTimer = setInterval(pollSocial, POLL_MS);
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

// The signed-in student's own data starts empty and is loaded from the database.
const noMine: Pick<
  State,
  | "myListings"
  | "saved"
  | "savedSearches"
  | "reports"
  | "conversations"
  | "offers"
  | "incomingOffers"
  | "notifications"
  | "orders"
  | "reviews"
> = {
  myListings: [],
  saved: [],
  savedSearches: [],
  reports: [],
  conversations: [],
  offers: {},
  incomingOffers: [],
  notifications: [],
  orders: [],
  reviews: [],
};
let mineLoadedFor: string | null = null;
// What's kept only in this browser, cleared on sign-out.
const noHistory: Pick<State, "recentlyViewed" | "recentSearches"> = { recentlyViewed: [], recentSearches: [] };
let socialLoadedFor: string | null = null;
let stopWatching: (() => void) | null = null;

/** Reloads conversations, offers, notifications and orders. The first load for an account doesn't pop up notifications. */
const refreshSocial = once(async () => {
  const profileId = state.user?.profileId;
  if (!profileId) return;
  const version = writes;
  lastSocial = Date.now();
  const [social, orders] = await Promise.all([
    Social.loadSocial(profileId).catch(() => null),
    Orders.loadOrders(profileId).catch(() => null),
  ]);
  if (version !== writes) return void setTimeout(refreshSocial, 0);
  if (state.user?.profileId !== profileId) return;
  commit((s) => ({
    ...s,
    syncError: !social || !orders ? "Some account data couldn't refresh. Check your connection and retry." : undefined,
  }));
  const first = socialLoadedFor !== profileId;
  if (social) socialLoadedFor = profileId;
  commit((s) => ({ ...s, ...(social ?? {}), ...(orders ? { orders } : {}) }), first);
});

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
  live = false;
  if (profileId)
    stopWatching = Social.watchSocial(profileId, refreshSocialSoon, (connected) => {
      // Catch up on anything missed while the connection was down.
      if (connected && !live) refreshSocialSoon();
      live = connected;
    });
}

// Bumped by every change the student makes, so a load that started before it isn't
// allowed to overwrite it with older data.
let writes = 0;

/** Runs one load at a time per kind; calls while one is running share it. */
function once(fn: () => Promise<void>) {
  let running: Promise<void> | null = null;
  const run = (): Promise<void> => {
    const profileId = state.user?.profileId;
    return (running ??= fn().finally(() => {
      running = null;
      if (state.user?.profileId && state.user.profileId !== profileId) void run();
    }));
  };
  return run;
}

/** Reloads the student's listings, saved items, searches and reports from the database. */
const refreshMine = once(async () => {
  const profileId = state.user?.profileId;
  if (!profileId) return;
  const version = writes;
  const mine = await Mine.loadMine(profileId).catch(() => null);
  if (!mine && state.user?.profileId === profileId)
    commit((s) => ({ ...s, mineSyncError: "Your listings and saved items couldn’t refresh. Retry when connected." }));
  if (version !== writes) return void setTimeout(refreshMine, 0);
  // Ignore an answer for someone who has since signed out.
  if (mine && state.user?.profileId === profileId) {
    mineLoadedFor = profileId;
    commit((s) => ({ ...s, ...mine, mineSyncError: undefined }));
  }
});

/** Shows a database error and reloads, undoing an optimistic change. */
function failed(message: string | null) {
  // The write is done, so loads that started before it are out of date.
  writes++;
  if (!message) return;
  toast(message);
  refreshMine();
}

const me = () => state.user?.profileId;

/** Moves an order: shown at once, then saved; the database decides if the move is allowed. */
const pendingOrders = new Set<string>();
async function moveOrder(
  orderId: string,
  status: OrderStatus,
  optimistic: (s: State) => State,
  remote = () => Orders.setOrderStatusRemote(orderId, status),
): Promise<boolean> {
  if (pendingOrders.has(orderId)) return false;
  pendingOrders.add(orderId);
  const profileId = me();
  const previous = state.orders.find((order) => order.id === orderId);
  writes++;
  commit(optimistic);
  try {
    const error = await remote().catch(() => "Couldn't confirm the order update. Check your connection and retry.");
    writes++;
    if (state.user?.profileId !== profileId) return false;
    if (error) {
      toast(error);
      if (previous) commit((s) => ({ ...s, orders: s.orders.map((order) => (order.id === orderId ? previous : order)) }));
    }
    await refreshSocial();
    if (status === "cancelled" && !error) {
      // The item is back on the market.
      if (previous?.listingId) void refreshListing(previous.listingId).catch(() => {});
      void refreshMarket()
        .then(setMarket)
        .catch(() => {});
    }
    return !error;
  } finally {
    pendingOrders.delete(orderId);
  }
}

export const actions = {
  /** Mirrors the Supabase session; called by <AuthSync /> whenever it changes. */
  setUser(user: User | null) {
    const switched = state.user?.profileId !== user?.profileId;
    const same = !switched && state.user?.email === user?.email && state.user?.name === user?.name;
    // Browsing history lives in this browser. It carries over when a visitor signs in,
    // but not to someone else using the same browser afterwards.
    const otherPerson = switched && !!state.user?.profileId;
    // A visitor signing in brings what they browsed into their account.
    const arriving = switched && !state.user?.profileId && !!user?.profileId;
    const visitorHistory = { viewed: state.recentlyViewed, searches: state.recentSearches };
    if (!same)
      commit(
        (s) => ({
          ...s,
          user,
          ...(switched
            ? {
                ...noMine,
                unreadMessages: 0,
                moreNotifications: false,
                moreConversations: false,
                syncError: undefined,
                mineSyncError: undefined,
              }
            : {}),
          ...(otherPerson ? noHistory : {}),
        }),
        true,
      );
    if (switched) {
      pendingOrders.clear();
      Mine.resetPhotoUploads();
      Social.resetSocialLimits();
      Orders.resetOrderLimit();
      mineLoadedFor = null;
      socialLoadedFor = null;
      watch(user?.profileId);
      if (user?.profileId) void syncPushSubscription(user.profileId);
    }
    if (arriving && (visitorHistory.viewed.length || visitorHistory.searches.length)) {
      writes++;
      Mine.mergeHistory(user!.profileId!, visitorHistory.viewed, visitorHistory.searches).then(() => {
        writes++;
        refreshMine();
      });
    } else if (user?.profileId && mineLoadedFor !== user.profileId) refreshMine();
    if (user?.profileId && socialLoadedFor !== user.profileId) refreshSocial();
  },
  refreshMine,
  refreshSocial,
  closeMessageHistory: Social.closeMessageHistory,
  async loadListingOffer(listingId: string) {
    const profileId = me();
    if (!profileId) return;
    try {
      const offer = await Social.loadListingOffer(profileId, listingId);
      if (me() !== profileId) return;
      commit((s) => {
        const offers = { ...s.offers };
        if (offer) offers[listingId] = offer;
        else delete offers[listingId];
        return { ...s, offers };
      });
    } catch {
      toast("Couldn't refresh your offer. Check your connection before ordering.");
    }
  },
  async loadMoreSocial(kind: "conversations" | "messages" | "notifications" | "incoming", conversationId?: string) {
    const profileId = me();
    if (!profileId) return;
    try {
      await Social.expandSocialHistory(kind, profileId, conversationId);
      await refreshSocial();
    } catch {
      toast("Couldn't load older history. Your current data is kept. Try again.");
    }
  },
  async loadMoreOrders() {
    const profileId = me();
    if (!profileId) return;
    try {
      await Orders.expandOrderHistory(profileId);
      await refreshSocial();
    } catch {
      toast("Couldn't load older orders. Your current orders are kept. Try again.");
    }
  },
  async signOut() {
    // While still signed in, so the database lets us remove it.
    await forgetPushSubscription().catch(() =>
      toast("Notifications could not be disabled. Turn them off in this browser's site settings on a shared device."),
    );
    try {
      localStorage.removeItem("hilltop-message-drafts");
    } catch {}
    const error = await signOutEverywhere();
    if (error) {
      toast(error);
      return false;
    }
    watch(undefined);
    commit((s) => ({ ...s, user: null, ...noMine, ...noHistory, unreadMessages: 0, syncError: undefined, mineSyncError: undefined }), true);
    return true;
  },
  /** Saves or unsaves a listing. Signed-out visitors are asked to sign in instead. */
  toggleSaved(id: string): "saved" | "removed" | "sign-in" {
    const profileId = me();
    if (!profileId) return "sign-in";
    writes++;
    const saving = !state.saved.includes(id);
    commit((s) => ({ ...s, saved: saving ? [...s.saved, id] : s.saved.filter((x) => x !== id) }));
    Mine.setSavedRemote(profileId, id, saving).then(failed);
    return saving ? "saved" : "removed";
  },

  // Orders: reserved in the app, paid to the seller at pickup.
  async placeOrder(input: { listing: Listing; quantity?: number; slot?: string }): Promise<{ order: Order } | { error: string }> {
    if (!me()) return { error: "Sign in to buy." };
    const placed = await Orders.placeOrderRemote({ listingId: input.listing.id, quantity: input.quantity ?? 1, slot: input.slot });
    if ("error" in placed) return placed;
    await refreshSocial();
    // A load that was already running started before this order existed.
    if (!state.orders.some((o) => o.id === placed.id)) await refreshSocial();
    // The item is reserved now: sold, or with less stock. Its own page updates first.
    await refreshListing(input.listing.id).catch(() => {});
    refreshMarket()
      .then(setMarket)
      .catch(() => {});
    const order = state.orders.find((o) => o.id === placed.id);
    return order ? { order } : { error: "Your order was placed. Find it under Your orders." };
  },
  markReady(orderId: string) {
    return moveOrder(orderId, "ready", (s) => M.markReady(s, orderId, Date.now()));
  },
  /** The seller records the meet-up. The buyer confirms collection, which completes the order. */
  markHandedOver(orderId: string) {
    return moveOrder(
      orderId,
      "ready",
      (s) => M.markHandedOver(s, orderId, Date.now()),
      () => Orders.markHandedOverRemote(orderId),
    );
  },
  confirmCollection(orderId: string) {
    return moveOrder(orderId, "collected", (s) => M.confirmCollection(s, orderId, Date.now()));
  },
  cancelOrder(orderId: string) {
    return moveOrder(orderId, "cancelled", (s) => ({
      ...s,
      orders: s.orders.map((o) =>
        o.id === orderId ? { ...o, status: "cancelled", timeline: [...o.timeline, { status: "cancelled", at: Date.now() }] } : o,
      ),
    }));
  },
  /** Reports a problem with an order. The database keeps the case and holds the order until it's settled. */
  async openDispute(orderId: string, reason: DisputeReason, details: string) {
    writes++;
    commit((s) => M.openDispute(s, orderId, reason, details, Date.now()));
    const error = await Orders.openDisputeRemote(orderId, reason, details);
    writes++;
    if (error) toast(error);
    await refreshSocial();
    return !error;
  },
  withdrawDispute(orderId: string) {
    writes++;
    commit((s) => M.withdrawDispute(s, orderId, Date.now()));
    Orders.withdrawDisputeRemote(orderId).then((error) => {
      writes++;
      if (error) toast(error);
      refreshSocial();
    });
  },
  async addReview(r: Omit<Review, "id" | "at" | "author">) {
    writes++;
    const profileId = me();
    if (!profileId) return false;
    commit((s) => M.addReview(s, { ...r, id: uid("rev"), at: Date.now(), author: s.user?.name ?? "You" }));
    const sellerProfileId = getSeller(r.sellerId)?.profileId ?? (await Orders.sellerOf(r.orderId));
    const error = sellerProfileId ? await Orders.addReviewRemote(profileId, sellerProfileId, r) : "Couldn't post your review.";
    if (error) toast(error);
    refreshSocial();
    return !error;
  },

  // Listings: photos are uploaded first, then the listing and its photos are saved.
  async saveListing(listing: Listing): Promise<{ listing: Listing } | { error: string }> {
    writes++;
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
    const error = await Mine.saveListingRemote(saved, profileId, isNew).catch(
      () => "Couldn’t confirm your listing was saved. Check your listings before retrying.",
    );
    writes++;
    if (error) return { error };
    if (me() !== profileId) return { error: "Your account changed. Sign in and reload your listings." };
    commit((s) => M.upsertListing(s, saved));
    return { listing: saved };
  },
  setListingStatus(id: string, status: ListingStatus) {
    writes++;
    commit((s) => M.setListingStatus(s, id, status));
    Mine.setListingStatusRemote(id, status).then(failed);
  },
  renewListing(id: string) {
    writes++;
    commit((s) => M.renewListing(s, id));
    Mine.renewListingRemote(id).then(failed);
  },
  deleteListing(id: string) {
    writes++;
    commit((s) => M.deleteListing(s, id));
    Mine.deleteListingRemote(id).then(failed);
  },

  // Offers: the seller is notified and answers from the listing page.
  async makeOffer(listing: Listing, amount: number) {
    writes++;
    const profileId = me();
    if (!profileId) return "Sign in to make an offer.";
    const error = await Social.makeOfferRemote(profileId, listing.id, amount);
    if (!error) commit((s) => M.makeOffer(s, listing.id, amount, Date.now()));
    return error;
  },
  /**
   * Accepts or declines an offer. Shown as answered only once the database has it, so
   * leaving the page straight after tapping can't silently lose the answer.
   */
  async answerOffer(offerId: string, accepted: boolean) {
    writes++;
    const error = await Social.answerOfferRemote(offerId, accepted).catch(() => "Couldn't answer the offer. Try again.");
    writes++;
    if (error) toast(error);
    else
      commit((s) => ({
        ...s,
        incomingOffers: s.incomingOffers?.map((o) => (o.id === offerId ? { ...o, status: accepted ? "accepted" : "declined" } : o)),
      }));
    refreshSocial();
    return error;
  },

  /**
   * Sends a message. From a listing page, `about` is that listing: the message continues
   * the student's one chat with its seller and shows the item. Replies in the inbox pass
   * the conversation and no item.
   */
  async sendMessage(about: Listing | null, otherName: string, text: string, conversationId?: string, messageId = crypto.randomUUID()) {
    writes++;
    const profileId = me();
    if (!profileId) return null;
    const existing =
      state.conversations.find((c) => c.id === conversationId) ??
      (about ? state.conversations.find((c) => c.sellerId === about.sellerId) : undefined);
    if (!existing && !about) return null;
    const tempId = existing?.id ?? uid("c");
    const item = about
      ? { id: about.id, title: about.title, price: about.price, image: about.images[0], sellerHandle: about.sellerId }
      : undefined;
    commit((s) =>
      M.sendMessage(s, {
        conversationId: tempId,
        item,
        sellerId: existing?.sellerId ?? about!.sellerId,
        sellerName: otherName,
        text,
        id: messageId,
        now: Date.now(),
      }),
    );
    const result = await Social.sendMessageRemote(
      profileId,
      about ? { listingId: about.id } : null,
      existing && !existing.id.startsWith("c-") ? existing.id : undefined,
      text,
      messageId,
    ).catch(() => ({ error: "Couldn't confirm your message. Retry to check or send it safely." }));
    writes++;
    if ("error" in result) {
      toast(result.error);
      commit((s) => ({
        ...s,
        conversations: s.conversations.map((c) => ({ ...c, messages: c.messages.filter((m) => m.id !== messageId) })),
      }));
      refreshSocial();
      return null;
    }
    // A new conversation gets its real id; the message gets its own on the next load.
    if (result.conversationId !== tempId) {
      commit((s) => ({ ...s, conversations: s.conversations.map((c) => (c.id === tempId ? { ...c, id: result.conversationId } : c)) }));
    }
    refreshSocialSoon();
    return result.conversationId;
  },
  async editMessage(conversationId: string, messageId: string, text: string) {
    writes++;
    const body = text.trim();
    commit((s) => ({
      ...s,
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, messages: c.messages.map((m) => (m.id === messageId ? { ...m, text: body, edited: true } : m)) }
          : c,
      ),
    }));
    const error = await Social.editMessageRemote(messageId, body);
    writes++;
    if (error) toast(error);
    refreshSocialSoon();
    return !error;
  },
  async deleteMessage(conversationId: string, messageId: string) {
    writes++;
    commit((s) => ({
      ...s,
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, messages: c.messages.map((m) => (m.id === messageId ? { ...m, text: "", deleted: true } : m)) }
          : c,
      ),
    }));
    const error = await Social.deleteMessageRemote(messageId);
    writes++;
    if (error) toast(error);
    refreshSocialSoon();
  },
  readConversation(id: string) {
    writes++;
    if (!state.conversations.find((c) => c.id === id)?.unread) return;
    commit((s) => M.readConversation(s, id));
    const profileId = me();
    if (profileId)
      Social.readConversationRemote(profileId, id).then((error) => {
        writes++;
        if (error) {
          toast(error);
          refreshSocialSoon();
        }
      });
  },

  // Notifications
  markAllRead() {
    writes++;
    commit(M.markAllRead);
    Social.markReadRemote().then((error) => {
      writes++;
      if (error) {
        toast(error);
        refreshSocialSoon();
      }
    });
  },
  markRead(id: string) {
    writes++;
    commit((s) => M.markRead(s, id));
    Social.markReadRemote(id).then((error) => {
      writes++;
      if (error) {
        toast(error);
        refreshSocialSoon();
      }
    });
  },

  // Search
  addRecentSearch(query: string) {
    const q = query.trim();
    if (!q) return;
    commit((s) => ({ ...s, recentSearches: [q, ...s.recentSearches.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 5) }));
    const profileId = me();
    if (profileId) {
      writes++;
      Mine.recordSearchRemote(profileId, q.slice(0, 100)).then(failed);
    }
  },
  clearRecentSearches() {
    writes++;
    commit((s) => ({ ...s, recentSearches: [] }));
    if (me()) Mine.clearHistoryRemote("searches").then(failed);
  },
  clearRecentlyViewed() {
    writes++;
    commit((s) => ({ ...s, recentlyViewed: [] }));
    if (me()) Mine.clearHistoryRemote("views").then(failed);
  },
  removeRecentlyViewed(id: string) {
    writes++;
    commit((s) => ({ ...s, recentlyViewed: s.recentlyViewed.filter((x) => x !== id) }));
    if (me()) Mine.clearHistoryRemote("views", id).then(failed);
  },
  async saveSearch(search: Omit<SavedSearch, "id" | "createdAt" | "alerts">) {
    writes++;
    const profileId = me();
    if (!profileId || state.savedSearches.some((x) => x.query === search.query)) return;
    const created = await Mine.saveSearchRemote(profileId, search);
    if ("error" in created) return toast(created.error);
    commit((s) => M.saveSearch(s, { ...search, ...created, alerts: true }));
  },
  removeSearch(id: string) {
    writes++;
    commit((s) => M.removeSearch(s, id));
    Mine.removeSearchRemote(id).then(failed);
  },
  toggleAlerts(id: string) {
    writes++;
    commit((s) => M.toggleAlerts(s, id));
    const search = state.savedSearches.find((x) => x.id === id);
    if (search) Mine.updateSearchRemote(id, { alerts: search.alerts }).then(failed);
  },
  markSearchSeen(id: string, matchIds: string[]) {
    writes++;
    const search = state.savedSearches.find((x) => x.id === id);
    if (!search || search.seenIds.join() === matchIds.join()) return;
    commit((s) => M.markSearchSeen(s, id, matchIds));
    Mine.updateSearchRemote(id, { seen_ids: matchIds }).then(failed);
  },
  reportListing(listingId: string, reason: string, details: string) {
    writes++;
    commit((s) => M.reportListing(s, { listingId, reason, details, at: Date.now() }));
    const profileId = me();
    if (profileId) Mine.reportRemote(profileId, { listingId, reason, details }).then(failed);
  },
  recordView(id: string) {
    if (state.recentlyViewed[0] !== id) {
      commit((s) => M.recordView(s, id));
      const profileId = me();
      if (profileId) {
        writes++;
        Mine.recordViewRemote(profileId, id).then(failed);
      }
    }
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
  return { ...snapshot, ...actions, myListings, allListings, activeListings, moreOrders: Orders.hasMoreOrders() };
}

/** A listing by id, including the user's own and with their changes applied. */
export function findListing(all: Listing[], id: string) {
  return all.find((l) => l.id === id) ?? getListing(id);
}
