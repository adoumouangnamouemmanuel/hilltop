import { unsplash } from "./catalog";
import { getSeller, type Listing, type ListingStatus } from "./data";
import { formatCedi } from "./format";
import { applyFilters, parseFilters } from "./search";
import type {
  AppNotification,
  Conversation,
  DisputeReason,
  NotificationKind,
  Order,
  OrderStatus,
  PayoutState,
  Review,
  SavedSearch,
  State,
} from "./types";

/*
 * Pure state transitions for the marketplace. Every function takes the current
 * state and returns a new one, with time and ids passed in, so they are easy to
 * test and will map one-to-one onto backend endpoints later.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Fixed reference time for seed data, so server and client render the same thing. */
export const SEED_TIME = Date.UTC(2026, 9, 31, 10, 0);

// ---------- Listings ----------

export const isActive = (l: Listing) => (l.status ?? "active") === "active";
export const isSoldOut = (l: Listing) => l.stock !== undefined && l.stock <= 0;

/** Platform listings with the user's changes applied, plus the user's own listings first. */
export function mergeListings(seed: Listing[], s: Pick<State, "myListings" | "overrides">): Listing[] {
  const patched = seed.map((l) => (s.overrides[l.id] ? { ...l, ...s.overrides[l.id] } : l));
  return [...s.myListings, ...patched];
}

export function upsertListing(s: State, listing: Listing): State {
  const exists = s.myListings.some((l) => l.id === listing.id);
  return {
    ...s,
    myListings: exists ? s.myListings.map((l) => (l.id === listing.id ? listing : l)) : [listing, ...s.myListings],
  };
}

export function setListingStatus(s: State, id: string, status: ListingStatus): State {
  return { ...s, myListings: s.myListings.map((l) => (l.id === id ? { ...l, status } : l)) };
}

/** Bumps a listing back to the top of "newest" and reactivates it. */
export function renewListing(s: State, id: string): State {
  return { ...s, myListings: s.myListings.map((l) => (l.id === id ? { ...l, postedDaysAgo: 0, status: "active" } : l)) };
}

export function deleteListing(s: State, id: string): State {
  return { ...s, myListings: s.myListings.filter((l) => l.id !== id), saved: s.saved.filter((x) => x !== id) };
}

function changeStock(s: State, listingId: string, delta: number): State {
  const own = s.myListings.find((l) => l.id === listingId);
  if (own) {
    if (own.stock === undefined) return delta < 0 ? setListingStatus(s, listingId, "sold") : s;
    const stock = Math.max(0, own.stock + delta);
    return {
      ...s,
      myListings: s.myListings.map((l) => (l.id === listingId ? { ...l, stock, status: stock === 0 ? "sold" : l.status } : l)),
    };
  }
  return s;
}

// ---------- Notifications ----------

export function notify(s: State, n: { id: string; kind: NotificationKind; title: string; body: string; href: string; at: number }): State {
  const item: AppNotification = { ...n, read: false };
  return { ...s, notifications: [item, ...s.notifications].slice(0, 50) };
}

export const markAllRead = (s: State): State => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) });

export const markRead = (s: State, id: string): State => ({
  ...s,
  notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
});

export const unreadCount = (s: Pick<State, "notifications">) => s.notifications.filter((n) => !n.read).length;

// ---------- Orders ----------

export function payoutState(o: Pick<Order, "status" | "dispute">): PayoutState {
  if (o.status === "collected") return "released";
  if (o.status === "refunded") return "refunded";
  if (o.status === "disputed") return "frozen";
  return "held";
}

/** Which step of Paid, Ready, Collected, Released the order has reached (0 to 4). */
export function orderProgress(status: OrderStatus) {
  return { paid: 1, ready: 2, disputed: 2, collected: 4, refunded: 4 }[status];
}

function setStatus(o: Order, status: OrderStatus, at: number): Order {
  return { ...o, status, timeline: [...o.timeline, { status, at }] };
}

function updateOrder(s: State, id: string, fn: (o: Order) => Order): State {
  return { ...s, orders: s.orders.map((o) => (o.id === id ? fn(o) : o)) };
}

export type PlaceOrderInput = {
  id: string;
  listing: Listing;
  quantity: number;
  unitPrice: number;
  fee: number;
  slot?: string;
  now: number;
};

export function placeOrder(s: State, i: PlaceOrderInput): State {
  const seller = getSeller(i.listing.sellerId);
  const order: Order = {
    id: i.id,
    listingId: i.listing.id,
    role: "buying",
    counterpart: seller?.name ?? "Seller",
    quantity: i.quantity,
    amount: i.unitPrice * i.quantity,
    fee: i.fee,
    slot: i.slot,
    status: "paid",
    placedAt: i.now,
    timeline: [{ status: "paid", at: i.now }],
  };
  let next: State = { ...s, orders: [order, ...s.orders] };

  // Stock goes down for batch items; one-off platform items are marked sold.
  const seedStock = i.listing.stock;
  if (s.myListings.some((l) => l.id === i.listing.id)) next = changeStock(next, i.listing.id, -i.quantity);
  else if (seedStock !== undefined) {
    const stock = Math.max(0, seedStock - i.quantity);
    next = { ...next, overrides: { ...next.overrides, [i.listing.id]: { stock, status: stock === 0 ? "sold" : "active" } } };
  } else next = { ...next, overrides: { ...next.overrides, [i.listing.id]: { status: "sold" } } };

  return notify(next, {
    id: `n-${i.id}`,
    kind: "order",
    title: "Payment held safely",
    body: `${formatCedi(order.amount + order.fee)} for ${i.listing.title}. Meet at ${i.listing.pickup}${i.slot ? `, ${i.slot}` : ""}.`,
    href: "/me",
    at: i.now,
  });
}

export function markReady(s: State, orderId: string, now: number): State {
  return updateOrder(s, orderId, (o) => (o.status === "paid" ? setStatus(o, "ready", now) : o));
}

export function confirmCollection(s: State, orderId: string, now: number): State {
  const order = s.orders.find((o) => o.id === orderId);
  if (!order || !["paid", "ready"].includes(order.status)) return s;
  const next = updateOrder(s, orderId, (o) => setStatus(o, "collected", now));
  return notify(next, {
    id: `n-pay-${orderId}`,
    kind: "payout",
    title: order.role === "selling" ? "Payout released" : "Payment released",
    body:
      order.role === "selling"
        ? `${formatCedi(order.amount)} is on its way to your MoMo.`
        : `${order.counterpart} has been paid. How did the meet-up go?`,
    href: order.role === "selling" ? "/me?tab=selling" : "/me",
    at: now,
  });
}

/** The label for a dispute reason id, from the configured list. */
export const disputeLabel = (reasons: { id: string; label: string }[], id: string) => reasons.find((r) => r.id === id)?.label ?? id;

export function openDispute(s: State, orderId: string, reason: DisputeReason, details: string, now: number): State {
  const order = s.orders.find((o) => o.id === orderId);
  if (!order || !["paid", "ready"].includes(order.status)) return s;
  const next = updateOrder(s, orderId, (o) => ({
    ...setStatus(o, "disputed", now),
    dispute: { reason, details, openedAt: now, state: "open" },
  }));
  return notify(next, {
    id: `n-dispute-${orderId}`,
    kind: "dispute",
    title: "Problem reported",
    body: "Your payment is frozen while Hilltop reviews it. We reply within 24 hours.",
    href: "/me",
    at: now,
  });
}

/** Restores the status the order had before the dispute. */
export function withdrawDispute(s: State, orderId: string, now: number): State {
  return updateOrder(s, orderId, (o) => {
    if (o.status !== "disputed" || !o.dispute) return o;
    const before = [...o.timeline].reverse().find((t) => t.status !== "disputed")?.status ?? "paid";
    return { ...setStatus(o, before, now), dispute: { ...o.dispute, state: "withdrawn" } };
  });
}

export function resolveDispute(s: State, orderId: string, outcome: "refunded" | "released", now: number): State {
  const order = s.orders.find((o) => o.id === orderId);
  if (!order?.dispute || order.status !== "disputed") return s;
  if (outcome === "released") {
    const next = updateOrder(s, orderId, (o) => ({ ...o, dispute: { ...o.dispute!, state: "withdrawn" } }));
    return confirmCollection(
      updateOrder(next, orderId, (o) => ({ ...o, status: "ready" })),
      orderId,
      now,
    );
  }
  const next = updateOrder(s, orderId, (o) => ({ ...setStatus(o, "refunded", now), dispute: { ...o.dispute!, state: "refunded" } }));
  return notify(next, {
    id: `n-refund-${orderId}`,
    kind: "dispute",
    title: "Refund approved",
    body: `${formatCedi(order.amount + order.fee)} is being returned to you.`,
    href: "/me",
    at: now,
  });
}

// ---------- Reviews ----------

export function addReview(s: State, r: Review): State {
  return {
    ...updateOrder(s, r.orderId, (o) => ({ ...o, reviewed: true })),
    reviews: [r, ...s.reviews],
  };
}

/** Seller rating combining the platform's numbers with reviews written in this session. */
export function sellerStats(base: { rating: number; reviews: number }, extra: Pick<Review, "rating">[]) {
  const count = base.reviews + extra.length;
  const total = base.rating * base.reviews + extra.reduce((n, r) => n + r.rating, 0);
  return { rating: count ? Math.round((total / count) * 10) / 10 : 0, reviews: count };
}

// ---------- Offers ----------

export function makeOffer(s: State, listingId: string, amount: number, now: number): State {
  return { ...s, offers: { ...s.offers, [listingId]: { amount, status: "pending", at: now } } };
}

export function answerOffer(s: State, listing: Listing, accepted: boolean, now: number): State {
  const offer = s.offers[listing.id];
  if (!offer || offer.status !== "pending") return s;
  const next = { ...s, offers: { ...s.offers, [listing.id]: { ...offer, status: accepted ? "accepted" : "declined" } as const } };
  const seller = getSeller(listing.sellerId)?.name.split(" ")[0] ?? "The seller";
  return notify(next, {
    id: `n-offer-${listing.id}-${now}`,
    kind: "offer",
    title: accepted ? "Offer accepted" : "Offer declined",
    body: accepted
      ? `${seller} accepted ${formatCedi(offer.amount)} for ${listing.title}. Buy now at that price.`
      : `${seller} declined your offer on ${listing.title}.`,
    href: `/listing/${listing.id}`,
    at: now,
  });
}

/** Demo sellers accept offers at or above the configured share of the price. */
export const wouldAccept = (offer: number, price: number, autoAcceptRatio: number) => offer >= price * autoAcceptRatio;

// ---------- Messages ----------

export function sendMessage(
  s: State,
  m: { conversationId: string; listingId: string; sellerId: string; sellerName: string; text: string; id: string; now: number },
): State {
  const msg = { id: m.id, from: "me" as const, text: m.text, at: m.now };
  const existing = s.conversations.find((c) => c.id === m.conversationId);
  const convo: Conversation = existing
    ? { ...existing, messages: [...existing.messages, msg] }
    : { id: m.conversationId, listingId: m.listingId, sellerId: m.sellerId, sellerName: m.sellerName, messages: [msg], unread: 0 };
  return { ...s, conversations: [convo, ...s.conversations.filter((c) => c.id !== m.conversationId)] };
}

export function receiveMessage(s: State, conversationId: string, text: string, id: string, now: number): State {
  const convo = s.conversations.find((c) => c.id === conversationId);
  if (!convo) return s;
  const updated = { ...convo, unread: convo.unread + 1, messages: [...convo.messages, { id, from: "them" as const, text, at: now }] };
  const next = { ...s, conversations: [updated, ...s.conversations.filter((c) => c.id !== conversationId)] };
  return notify(next, {
    id: `n-${id}`,
    kind: "message",
    title: convo.sellerName,
    body: text,
    href: `/inbox?c=${conversationId}`,
    at: now,
  });
}

export function readConversation(s: State, conversationId: string): State {
  return {
    ...s,
    conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
    notifications: s.notifications.map((n) => (n.href === `/inbox?c=${conversationId}` ? { ...n, read: true } : n)),
  };
}

export const conversationIdFor = (listingId: string) => `c-${listingId}`;

/** Canned seller replies for the demo, picked by keywords in the buyer's message. */
export function autoReply(text: string) {
  const t = text.toLowerCase();
  if (/(available|still have|still got)/.test(t)) return "Yes, it's still available! When would you like to pick it up?";
  if (/(price|negotiable|discount|lower|last)/.test(t))
    return "I can go a little lower. Send an offer on the listing and I'll accept if it's fair.";
  if (/(meet|today|tomorrow|when|time|pick)/.test(t)) return "Today works for me. Library entrance around 4pm?";
  if (/(photo|picture|pic)/.test(t)) return "Sure, I'll add more photos to the listing in a bit.";
  return "Thanks for your message! I'll get back to you shortly.";
}

// ---------- Saved searches ----------

export function saveSearch(s: State, search: SavedSearch): State {
  if (s.savedSearches.some((x) => x.query === search.query)) return s;
  return { ...s, savedSearches: [search, ...s.savedSearches] };
}

export const removeSearch = (s: State, id: string): State => ({ ...s, savedSearches: s.savedSearches.filter((x) => x.id !== id) });

export const toggleAlerts = (s: State, id: string): State => ({
  ...s,
  savedSearches: s.savedSearches.map((x) => (x.id === id ? { ...x, alerts: !x.alerts } : x)),
});

export function markSearchSeen(s: State, id: string, matchIds: string[]): State {
  return { ...s, savedSearches: s.savedSearches.map((x) => (x.id === id ? { ...x, seenIds: matchIds } : x)) };
}

export function searchMatches(all: Listing[], query: string, labelOf?: (id: string) => string) {
  return applyFilters(all.filter(isActive), parseFilters(new URLSearchParams(query)), labelOf);
}

/** Notifies the user when a newly published listing matches one of their saved searches. */
export function alertMatches(s: State, listing: Listing, now: number): State {
  let next = s;
  for (const search of s.savedSearches) {
    if (!search.alerts) continue;
    if (!searchMatches([listing], search.query).length) continue;
    next = notify(next, {
      id: `n-alert-${search.id}-${listing.id}`,
      kind: "alert",
      title: `New match for “${search.label}”`,
      body: `${listing.title}, ${formatCedi(listing.price)}`,
      href: `/listing/${listing.id}`,
      at: now,
    });
  }
  return next;
}

// ---------- Recently viewed ----------

export function recordView(s: State, id: string): State {
  if (s.recentlyViewed[0] === id) return s;
  return { ...s, recentlyViewed: [id, ...s.recentlyViewed.filter((x) => x !== id)].slice(0, 12) };
}

// ---------- Seed ----------

const myWatch: Listing = {
  id: "my-smartwatch",
  title: "White smartwatch, 42mm",
  price: 380,
  category: "jewellery",
  condition: "Like new",
  images: [unsplash("1523275335684-37898b6baf30")],
  description: "Tracks steps, sleep and notifications. Barely worn, charger included.",
  attributes: { type: "Watch", material: "Stainless steel", size: "42mm" },
  sellerId: "me",
  pickup: "Library",
  postedDaysAgo: 3,
  saves: 28,
  views: 341,
};

const myEyeliner: Listing = {
  id: "my-eyeliner",
  title: "Liquid eyeliner pen, unused",
  price: 40,
  category: "beauty",
  condition: "New",
  images: [unsplash("1631214524020-7e18db9a8f92")],
  description: "Waterproof black liner. Wrong shade for me, never opened.",
  attributes: { type: "Makeup", sealed: true },
  sellerId: "me",
  pickup: "Cafeteria",
  postedDaysAgo: 9,
  status: "sold",
  saves: 9,
  views: 124,
};

const myCalculator: Listing = {
  id: "my-calculator",
  title: "Casio fx-82MS calculator",
  price: 60,
  category: "calculators",
  condition: "Good",
  images: [unsplash("1587145820266-a5951ee6f620")],
  description: "Reliable for Statistics and Accounting. Fresh battery.",
  attributes: { model: "Casio fx-82MS", exam: true, power: "Solar and battery" },
  sellerId: "me",
  pickup: "Library",
  postedDaysAgo: 16,
  status: "sold",
  saves: 14,
  views: 210,
};

export function seedState(): State {
  const t = SEED_TIME;
  return {
    user: null,
    saved: [],
    recentSearches: [],
    recentlyViewed: [],
    offers: {},
    customCategories: [],
    myListings: [myWatch, myEyeliner, myCalculator],
    overrides: {},
    orders: [
      {
        id: "ord-1042",
        listingId: "calculus-textbook",
        role: "buying",
        counterpart: "Efua Asante",
        quantity: 1,
        amount: 180,
        fee: 7.2,
        status: "ready",
        placedAt: t - DAY,
        timeline: [
          { status: "paid", at: t - DAY },
          { status: "ready", at: t - 20 * HOUR },
        ],
      },
      {
        id: "ord-0987",
        listingId: "desk-lamp",
        role: "buying",
        counterpart: "Nana Adjei",
        quantity: 1,
        amount: 120,
        fee: 4.8,
        status: "collected",
        placedAt: t - 17 * DAY,
        timeline: [
          { status: "paid", at: t - 17 * DAY },
          { status: "ready", at: t - 17 * DAY + 2 * HOUR },
          { status: "collected", at: t - 16 * DAY },
        ],
      },
      {
        id: "ord-1101",
        listingId: "my-smartwatch",
        role: "selling",
        counterpart: "Esi Boateng",
        quantity: 1,
        amount: 380,
        fee: 15.2,
        slot: "Today, 4 to 6pm",
        status: "paid",
        placedAt: t - 2 * HOUR,
        timeline: [{ status: "paid", at: t - 2 * HOUR }],
      },
      {
        id: "ord-0921",
        listingId: "my-eyeliner",
        role: "selling",
        counterpart: "Akua Mensah",
        quantity: 1,
        amount: 40,
        fee: 1.6,
        status: "collected",
        placedAt: t - 8 * DAY,
        timeline: [
          { status: "paid", at: t - 8 * DAY },
          { status: "ready", at: t - 8 * DAY + HOUR },
          { status: "collected", at: t - 7 * DAY },
        ],
        reviewed: true,
      },
      {
        id: "ord-0874",
        listingId: "my-calculator",
        role: "selling",
        counterpart: "Kojo Asamoah",
        quantity: 1,
        amount: 60,
        fee: 2.4,
        status: "collected",
        placedAt: t - 13 * DAY,
        timeline: [
          { status: "paid", at: t - 13 * DAY },
          { status: "ready", at: t - 13 * DAY + 3 * HOUR },
          { status: "collected", at: t - 12 * DAY },
        ],
        reviewed: true,
      },
    ],
    conversations: [
      {
        id: conversationIdFor("macbook-air-m1"),
        listingId: "macbook-air-m1",
        sellerId: "ama",
        sellerName: "Ama Owusu",
        unread: 1,
        messages: [
          { id: "m1", from: "me", text: "Hi Ama, does the MacBook come with the original box?", at: t - 3 * HOUR },
          { id: "m2", from: "them", text: "Hi! Yes, box and charger both included. Want to see it at the library?", at: t - 2.5 * HOUR },
        ],
      },
    ],
    notifications: [
      {
        id: "n-seed-1",
        kind: "order",
        title: "New order: White smartwatch",
        body: "Esi paid GH₵395.20. Mark it ready when you can meet.",
        href: "/me?tab=selling",
        at: t - 2 * HOUR,
        read: false,
      },
      {
        id: "n-seed-2",
        kind: "message",
        title: "Ama Owusu",
        body: "Hi! Yes, box and charger both included. Want to see it at the library?",
        href: `/inbox?c=${conversationIdFor("macbook-air-m1")}`,
        at: t - 2.5 * HOUR,
        read: false,
      },
      {
        id: "n-seed-3",
        kind: "order",
        title: "Ready for pickup",
        body: "Efua marked Calculus: Early Transcendentals ready at the Engineering block.",
        href: "/me",
        at: t - 20 * HOUR,
        read: true,
      },
    ],
    reviews: [],
    savedSearches: [],
  };
}
