import { describe, expect, it } from "vitest";
import { getListing, listings, type Listing } from "@/lib/data";
import * as M from "@/lib/model";
import type { State } from "@/lib/types";

const T = M.SEED_TIME;
const seed = () => M.seedState();
const listing = (id: string) => getListing(id)!;

function order(s: State, id: string) {
  return s.orders.find((o) => o.id === id)!;
}

function buy(s: State, l: Listing, quantity = 1, id = "ord-t1") {
  return M.placeOrder(s, { id, listing: l, quantity, unitPrice: l.price, fee: 1, now: T });
}

describe("placing orders", () => {
  it("creates a paid order with a timeline and a notification", () => {
    const s = buy(seed(), listing("iphone-x"));
    const o = order(s, "ord-t1");
    expect(o).toMatchObject({ role: "buying", status: "paid", amount: 1650, counterpart: "Selasi Tetteh" });
    expect(o.timeline).toEqual([{ status: "paid", at: T }]);
    expect(s.notifications[0]).toMatchObject({ kind: "order", read: false, href: "/me" });
  });

  it("marks one-off platform items as sold", () => {
    const s = buy(seed(), listing("iphone-x"));
    expect(s.overrides["iphone-x"]).toEqual({ status: "sold" });
    const merged = M.mergeListings(listings, s).find((l) => l.id === "iphone-x")!;
    expect(M.isActive(merged)).toBe(false);
  });

  it("decrements stock for batch items and sells out at zero", () => {
    const cookies = listing("choc-chip-cookies");
    let s = buy(seed(), cookies, 5);
    expect(s.overrides["choc-chip-cookies"]).toEqual({ stock: cookies.stock! - 5, status: "active" });
    expect(order(s, "ord-t1").amount).toBe(cookies.price * 5);

    const rest = { ...cookies, stock: cookies.stock! - 5 };
    s = buy(s, rest, rest.stock!, "ord-t2");
    const merged = M.mergeListings(listings, s).find((l) => l.id === cookies.id)!;
    expect(merged.stock).toBe(0);
    expect(M.isSoldOut(merged)).toBe(true);
  });
});

describe("order lifecycle", () => {
  it("goes paid, ready, collected and releases the payout", () => {
    let s = buy(seed(), listing("iphone-x"));
    s = M.markReady(s, "ord-t1", T + 1);
    expect(order(s, "ord-t1").status).toBe("ready");
    s = M.confirmCollection(s, "ord-t1", T + 2);
    const o = order(s, "ord-t1");
    expect(o.status).toBe("collected");
    expect(M.payoutState(o)).toBe("released");
    expect(o.timeline.map((t) => t.status)).toEqual(["paid", "ready", "collected"]);
    expect(s.notifications[0].kind).toBe("payout");
  });

  it("ignores invalid transitions", () => {
    const s = seed();
    // ord-0987 is already collected.
    expect(M.confirmCollection(s, "ord-0987", T)).toBe(s);
    expect(M.openDispute(s, "ord-0987", "damaged", "", T)).toBe(s);
    expect(M.markReady(s, "missing", T)).toEqual(s);
  });

  it("reports progress for the timeline", () => {
    expect(M.orderProgress("paid")).toBe(1);
    expect(M.orderProgress("ready")).toBe(2);
    expect(M.orderProgress("collected")).toBe(4);
  });
});

describe("disputes", () => {
  it("freezes the payout while open", () => {
    const s = M.openDispute(seed(), "ord-1042", "not-as-described", "Missing pages", T);
    const o = order(s, "ord-1042");
    expect(o.status).toBe("disputed");
    expect(o.dispute).toMatchObject({ reason: "not-as-described", details: "Missing pages", state: "open" });
    expect(M.payoutState(o)).toBe("frozen");
  });

  it("restores the previous status when withdrawn", () => {
    let s = M.openDispute(seed(), "ord-1042", "other", "x", T);
    s = M.withdrawDispute(s, "ord-1042", T + 1);
    const o = order(s, "ord-1042");
    expect(o.status).toBe("ready");
    expect(o.dispute?.state).toBe("withdrawn");
  });

  it("refunds the buyer when upheld", () => {
    let s = M.openDispute(seed(), "ord-1042", "damaged", "", T);
    s = M.resolveDispute(s, "ord-1042", "refunded", T + 1);
    expect(order(s, "ord-1042").status).toBe("refunded");
    expect(M.payoutState(order(s, "ord-1042"))).toBe("refunded");
  });

  it("releases payment when rejected", () => {
    let s = M.openDispute(seed(), "ord-1042", "damaged", "", T);
    s = M.resolveDispute(s, "ord-1042", "released", T + 1);
    expect(order(s, "ord-1042").status).toBe("collected");
  });
});

describe("reviews", () => {
  it("marks the order reviewed and updates the seller's rating", () => {
    const s = M.addReview(seed(), { id: "r", sellerId: "efua", orderId: "ord-1042", author: "Me", rating: 3, tags: [], text: "", at: T });
    expect(order(s, "ord-1042").reviewed).toBe(true);
    expect(s.reviews).toHaveLength(1);
    expect(M.sellerStats({ rating: 5, reviews: 9 }, s.reviews)).toEqual({ rating: 4.8, reviews: 10 });
  });

  it("handles sellers with no reviews", () => {
    expect(M.sellerStats({ rating: 0, reviews: 0 }, [])).toEqual({ rating: 0, reviews: 0 });
  });
});

describe("offers", () => {
  it("accepts offers at or above the configured share of the price", () => {
    expect(M.wouldAccept(85, 100, 0.85)).toBe(true);
    expect(M.wouldAccept(84, 100, 0.85)).toBe(false);
    expect(M.wouldAccept(60, 100, 0.6)).toBe(true);
  });

  it("records the answer once and notifies", () => {
    const l = listing("macbook-air-m1");
    let s = M.makeOffer(seed(), l.id, 6000, T);
    s = M.answerOffer(s, l, true, T + 1);
    expect(s.offers[l.id].status).toBe("accepted");
    expect(s.notifications[0]).toMatchObject({ kind: "offer", title: "Offer accepted" });
    // A second answer doesn't change anything.
    expect(M.answerOffer(s, l, false, T + 2)).toBe(s);
  });
});

describe("messages", () => {
  it("starts a conversation, receives a reply and clears unread", () => {
    const l = listing("airpods-pro");
    const id = M.conversationIdFor(l.id);
    let s = M.sendMessage(seed(), {
      conversationId: id,
      listingId: l.id,
      sellerId: l.sellerId,
      sellerName: "Ama Owusu",
      text: "Hi",
      id: "m-a",
      now: T,
    });
    expect(s.conversations[0]).toMatchObject({ id, unread: 0, messages: [{ from: "me", text: "Hi" }] });

    s = M.receiveMessage(s, id, "Hello!", "m-b", T + 1);
    expect(s.conversations[0].unread).toBe(1);
    expect(s.notifications[0]).toMatchObject({ kind: "message", href: `/inbox?c=${id}`, read: false });

    s = M.readConversation(s, id);
    expect(s.conversations[0].unread).toBe(0);
    expect(s.notifications[0].read).toBe(true);
  });

  it("picks canned replies by keyword", () => {
    expect(M.autoReply("Is this still available?")).toMatch(/still available/);
    expect(M.autoReply("Is the price negotiable?")).toMatch(/offer/);
    expect(M.autoReply("Can we meet today?")).toMatch(/Library/);
    expect(M.autoReply("hello")).toMatch(/get back/);
  });
});

describe("listings the user owns", () => {
  const mine: Listing = { ...listing("casio-fx991"), id: "my-test", sellerId: "me" };

  it("creates, edits and deletes", () => {
    let s = M.upsertListing(seed(), mine);
    expect(s.myListings[0].id).toBe("my-test");
    s = M.upsertListing(s, { ...mine, price: 99 });
    expect(s.myListings.filter((l) => l.id === "my-test")).toHaveLength(1);
    expect(s.myListings[0].price).toBe(99);
    s = M.deleteListing({ ...s, saved: ["my-test"] }, "my-test");
    expect(s.myListings.some((l) => l.id === "my-test")).toBe(false);
    expect(s.saved).toEqual([]);
  });

  it("marks sold and renews back to the top", () => {
    let s = M.upsertListing(seed(), { ...mine, postedDaysAgo: 9 });
    s = M.setListingStatus(s, "my-test", "sold");
    expect(s.myListings[0].status).toBe("sold");
    s = M.renewListing(s, "my-test");
    expect(s.myListings[0]).toMatchObject({ status: "active", postedDaysAgo: 0 });
  });
});

describe("saved searches and alerts", () => {
  const search = { id: "s1", label: "Casio", query: "q=casio", createdAt: T, seenIds: [], alerts: true };

  it("doesn't save the same search twice", () => {
    const s = M.saveSearch(M.saveSearch(seed(), search), { ...search, id: "s2" });
    expect(s.savedSearches).toHaveLength(1);
  });

  it("notifies when a new listing matches", () => {
    const s = M.saveSearch(seed(), search);
    const match: Listing = { ...listing("casio-fx991"), id: "my-casio" };
    const other: Listing = { ...listing("iphone-x"), id: "my-phone" };
    expect(M.alertMatches(s, match, T).notifications[0]).toMatchObject({ kind: "alert", href: "/listing/my-casio" });
    expect(M.alertMatches(s, other, T).notifications).toEqual(s.notifications);
    expect(M.alertMatches(M.toggleAlerts(s, "s1"), match, T).notifications).toEqual(s.notifications);
  });

  it("finds current matches, ignoring sold items", () => {
    const all = listings.map((l) => (l.id === "casio-fx991" ? { ...l, status: "sold" as const } : l));
    expect(M.searchMatches(all, "q=casio")).toEqual([]);
  });
});

describe("recently viewed", () => {
  it("keeps the newest first, without duplicates, capped at 12", () => {
    let s = seed();
    for (const l of listings.slice(0, 15)) s = M.recordView(s, l.id);
    s = M.recordView(s, listings[5].id);
    expect(s.recentlyViewed).toHaveLength(12);
    expect(s.recentlyViewed[0]).toBe(listings[5].id);
    expect(new Set(s.recentlyViewed).size).toBe(12);
  });
});

describe("notifications", () => {
  it("counts and clears unread", () => {
    const s = seed();
    expect(M.unreadCount(s)).toBe(2);
    expect(M.unreadCount(M.markAllRead(s))).toBe(0);
    expect(M.unreadCount(M.markRead(s, "n-seed-1"))).toBe(1);
  });
});
