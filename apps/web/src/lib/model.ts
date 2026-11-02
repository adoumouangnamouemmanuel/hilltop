import { getSeller, type Listing, type ListingStatus } from "./data";
import { autoReleaseAt, holdsMoney } from "@hilltop/shared/payments";
import { formatCedi } from "./format";
import { applyFilters, parseFilters } from "./search";
import type {
  AppNotification,
  ChatItem,
  Conversation,
  DisputeReason,
  ListingReport,
  Message,
  NotificationKind,
  Order,
  OrderPayment,
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

/** Fixed reference time for seed data, so server and client render the same thing. */
export const SEED_TIME = Date.UTC(2026, 9, 31, 10, 0);

// ---------- Listings ----------

export const isActive = (l: Listing) => (l.status ?? "active") === "active";
export const isSoldOut = (l: Listing) => l.stock !== undefined && l.stock <= 0;

/** Platform listings with the user's changes applied, plus the user's own listings first. */
export function mergeListings(seed: Listing[], s: Pick<State, "myListings" | "overrides">): Listing[] {
  // The student's own copy wins over the public one, which can be a minute behind.
  const mine = new Set(s.myListings.map((l) => l.id));
  const patched = seed.filter((l) => !mine.has(l.id)).map((l) => (s.overrides[l.id] ? { ...l, ...s.overrides[l.id] } : l));
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

/** The order's payment, defaulting older orders to fully protected. */
export function paymentOf(o: Pick<Order, "payment" | "amount" | "fee">): OrderPayment {
  return o.payment ?? { kind: "protected", paidInApp: o.amount + o.fee, dueAtPickup: 0 };
}

/** Whether the platform is holding money for this order. */
export const isHeld = (o: Pick<Order, "payment" | "amount" | "fee">) => holdsMoney(paymentOf(o).kind);

export function payoutState(o: Pick<Order, "status" | "dispute" | "payment" | "amount" | "fee">): PayoutState {
  if (!isHeld(o)) return "direct";
  if (o.status === "collected") return "released";
  if (o.status === "refunded") return "refunded";
  if (o.status === "disputed") return "frozen";
  return "held";
}

/** Which step of the order's timeline has been reached. Held orders have four steps, pay-at-pickup ones three. */
export function orderProgress(status: OrderStatus, held = true) {
  return held
    ? { paid: 1, ready: 2, disputed: 2, collected: 4, refunded: 4, cancelled: 0 }[status]
    : { paid: 1, ready: 2, disputed: 2, collected: 3, refunded: 3, cancelled: 0 }[status];
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
  payment: OrderPayment & { fee: number };
  slot?: string;
  now: number;
};

const placedCopy: Record<OrderPayment["kind"], (o: Order, l: Listing, slot?: string) => { title: string; body: string }> = {
  protected: (o, l, slot) => ({
    title: "Payment held safely",
    body: `${formatCedi(o.amount + o.fee)} for ${l.title}. Meet at ${l.pickup}${slot ? `, ${slot}` : ""}.`,
  }),
  deposit: (o, l, slot) => ({
    title: "Deposit paid",
    body: `${formatCedi(paymentOf(o).paidInApp)} deposit for ${l.title}. Pay ${formatCedi(paymentOf(o).dueAtPickup)} at ${l.pickup}${slot ? `, ${slot}` : ""}.`,
  }),
  pickup: (o, l, slot) => ({
    title: "Reserved for you",
    body: `${l.title} is yours. Pay ${formatCedi(o.amount)} at ${l.pickup}${slot ? `, ${slot}` : ""}.`,
  }),
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
    fee: i.payment.fee,
    slot: i.slot,
    status: "paid",
    placedAt: i.now,
    timeline: [{ status: "paid", at: i.now }],
    payment: { kind: i.payment.kind, paidInApp: i.payment.paidInApp, dueAtPickup: i.payment.dueAtPickup },
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
    ...placedCopy[order.payment!.kind](order, i.listing, i.slot),
    href: "/me",
    at: i.now,
  });
}

export function markReady(s: State, orderId: string, now: number): State {
  return updateOrder(s, orderId, (o) => (o.status === "paid" ? setStatus(o, "ready", now) : o));
}

/**
 * The seller says the item is with the buyer. The buyer then confirms collection, which
 * completes the order; for held money the handover also starts the auto-release clock.
 */
export function markHandedOver(s: State, orderId: string, now: number): State {
  const order = s.orders.find((o) => o.id === orderId);
  if (!order || !["paid", "ready"].includes(order.status) || order.handedOverAt) return s;
  return updateOrder(s, orderId, (o) => ({ ...(o.status === "paid" ? setStatus(o, "ready", now) : o), handedOverAt: now }));
}

export function confirmCollection(s: State, orderId: string, now: number, auto = false): State {
  const order = s.orders.find((o) => o.id === orderId);
  if (!order || !["paid", "ready"].includes(order.status)) return s;
  const next = updateOrder(s, orderId, (o) => ({ ...setStatus(o, "collected", now), autoReleased: auto || undefined }));
  const pay = paymentOf(order);
  const selling = order.role === "selling";
  const copy = !isHeld(order)
    ? {
        title: "Order complete",
        body: selling ? `${order.counterpart} has collected it.` : `Enjoy it. How did the meet-up with ${order.counterpart} go?`,
      }
    : {
        title: selling ? "Payout released" : auto ? "Payment released automatically" : "Payment released",
        body: selling
          ? `${formatCedi(pay.kind === "deposit" ? pay.paidInApp - order.fee : order.amount)} is on its way to your MoMo.`
          : auto
            ? `No problem was reported, so ${order.counterpart} has been paid.`
            : `${order.counterpart} has been paid. How did the meet-up go?`,
      };
  return notify(next, { id: `n-pay-${orderId}`, kind: "payout", ...copy, href: selling ? "/me?tab=selling" : "/me", at: now });
}

/** Releases held money whose auto-release time has passed. */
export function autoRelease(s: State, now: number, hours: number): State {
  let next = s;
  for (const o of s.orders) {
    const due = autoReleaseAt(o.handedOverAt, hours);
    if (due !== null && due <= now && o.status === "ready" && isHeld(o)) next = confirmCollection(next, o.id, now, true);
  }
  return next;
}

/** The label for a dispute reason id, from the configured list. */
export const disputeLabel = (reasons: { id: string; label: string }[], id: string) => reasons.find((r) => r.id === id)?.label ?? id;

export function openDispute(s: State, orderId: string, reason: DisputeReason, details: string, now: number): State {
  const order = s.orders.find((o) => o.id === orderId);
  if (!order || !["paid", "ready"].includes(order.status) || order.dispute?.state === "open") return s;
  const next = updateOrder(s, orderId, (o) => ({
    ...setStatus(o, "disputed", now),
    dispute: { reason, details, openedAt: now, state: "open" },
  }));
  return notify(next, {
    id: `n-dispute-${orderId}`,
    kind: "dispute",
    title: "Problem reported",
    body: isHeld(order)
      ? "Your payment is frozen while Hilltop reviews it. We reply within 24 hours."
      : "The order is on hold while Hilltop reviews it. We reply within 24 hours.",
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
    body: `${formatCedi(paymentOf(order).paidInApp)} is being returned to you.`,
    href: "/me",
    at: now,
  });
}

// ---------- Reports ----------

/** Records a report once per listing. The backend forwards it to the moderation queue. */
export function reportListing(s: State, r: ListingReport): State {
  if (s.reports?.some((x) => x.listingId === r.listingId)) return s;
  return { ...s, reports: [r, ...(s.reports ?? [])] };
}

export const hasReported = (s: Pick<State, "reports">, listingId: string) => !!s.reports?.some((r) => r.listingId === listingId);

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
  m: { conversationId: string; item?: ChatItem; sellerId: string; sellerName: string; text: string; id: string; now: number },
): State {
  const msg: Message = { id: m.id, from: "me", text: m.text, at: m.now, pending: true, listingId: m.item?.id, item: m.item };
  const existing = s.conversations.find((c) => c.id === m.conversationId);
  const convo: Conversation = existing
    ? { ...existing, ...(m.item ? { listingId: m.item.id, item: m.item } : {}), messages: [...existing.messages, msg] }
    : {
        id: m.conversationId,
        listingId: m.item?.id ?? "",
        item: m.item,
        sellerId: m.sellerId,
        sellerName: m.sellerName,
        messages: [msg],
        unread: 0,
      };
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
    ...(s.unreadMessages === undefined
      ? {}
      : { unreadMessages: Math.max(0, s.unreadMessages - (s.conversations.find((c) => c.id === conversationId)?.unread ?? 0)) }),
    conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
    notifications: s.notifications.map((n) => (n.href === `/inbox?c=${conversationId}` ? { ...n, read: true } : n)),
  };
}

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

export function seedState(): State {
  return {
    user: null,
    saved: [],
    recentSearches: [],
    recentlyViewed: [],
    offers: {},
    // Loaded from the database for the signed-in student.
    myListings: [],
    overrides: {},
    orders: [],
    // Loaded from the database for the signed-in student.
    conversations: [],
    notifications: [],
    reviews: [],
    savedSearches: [],
    reports: [],
  };
}
