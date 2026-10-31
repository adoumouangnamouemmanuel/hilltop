"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { CategoryDef } from "./catalog";
import { currentUser, listings as seedListings, type Listing } from "./data";

/*
 * Mock client-side store. Persists to localStorage so the demo survives
 * reloads; swap these actions for API calls once the backend exists.
 */

export type OrderStatus = "held" | "released";

export type Order = {
  id: string;
  listingId: string;
  amount: number;
  fee: number;
  status: OrderStatus;
  placedLabel: string;
};

type State = {
  user: typeof currentUser | null;
  saved: string[];
  orders: Order[];
  myListings: Listing[];
  recentSearches: string[];
  offers: Record<string, number>;
  customCategories: CategoryDef[];
};

const initialState: State = {
  user: null,
  saved: [],
  myListings: [],
  recentSearches: [],
  offers: {},
  customCategories: [],
  orders: [
    { id: "ord-1042", listingId: "calculus-textbook", amount: 180, fee: 7.2, status: "held", placedLabel: "Yesterday" },
    { id: "ord-0987", listingId: "desk-lamp", amount: 120, fee: 4.8, status: "released", placedLabel: "Oct 14" },
  ],
};

const STORAGE_KEY = "hilltop-market:v3";

let state = initialState;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...initialState, ...JSON.parse(raw) };
  } catch {}
}

function setState(update: (s: State) => State) {
  state = update(state);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  load();
  return state;
}

const getServerSnapshot = () => initialState;

const actions = {
  signIn(email: string, fullName?: string) {
    const name = fullName?.trim() || email
      .split("@")[0]
      .split(/[._]/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
    setState((s) => ({ ...s, user: { name: name || currentUser.name, email } }));
  },
  signOut() {
    setState((s) => ({ ...s, user: null }));
  },
  toggleSaved(id: string) {
    setState((s) => ({
      ...s,
      saved: s.saved.includes(id) ? s.saved.filter((x) => x !== id) : [...s.saved, id],
    }));
  },
  placeOrder(listing: Listing, fee: number) {
    const order: Order = {
      id: `ord-${Math.floor(1000 + Math.random() * 9000)}`,
      listingId: listing.id,
      amount: listing.price,
      fee,
      status: "held",
      placedLabel: "Just now",
    };
    setState((s) => ({ ...s, orders: [order, ...s.orders] }));
    return order;
  },
  confirmCollection(orderId: string) {
    setState((s) => ({
      ...s,
      orders: s.orders.map((o) => (o.id === orderId ? { ...o, status: "released" } : o)),
    }));
  },
  addListing(listing: Listing) {
    setState((s) => ({ ...s, myListings: [listing, ...s.myListings] }));
  },
  addRecentSearch(query: string) {
    const q = query.trim();
    if (!q) return;
    setState((s) => ({
      ...s,
      recentSearches: [q, ...s.recentSearches.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 5),
    }));
  },
  clearRecentSearches() {
    setState((s) => ({ ...s, recentSearches: [] }));
  },
  addCategory(category: CategoryDef) {
    setState((s) =>
      s.customCategories.some((c) => c.id === category.id) ? s : { ...s, customCategories: [...s.customCategories, category] },
    );
  },
  makeOffer(listingId: string, amount: number) {
    setState((s) => ({ ...s, offers: { ...s.offers, [listingId]: amount } }));
  },
};

export function useStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const allListings = useMemo(() => [...snapshot.myListings, ...seedListings], [snapshot.myListings]);
  return { ...snapshot, ...actions, allListings };
}
