import type { Listing } from "./data";
import { isActive } from "./model";
import type { Order } from "./types";

/*
 * Seller analytics. Totals (views, saves, orders, revenue) are real. Views and saves
 * aren't recorded per day yet, so their day-by-day curves are estimated: each
 * listing's real total is spread deterministically across its life. The dashboard
 * labels those charts as estimates.
 */

export const DAY = 86_400_000;

export type Period = 7 | 30 | 90;
export type DayPoint = { day: number; views: number; saves: number; orders: number; revenue: number };

/** Small seeded PRNG so the same listing always gets the same curve. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

export const startOfDay = (t: number) => Math.floor(t / DAY) * DAY;

/**
 * Splits a listing's total views across the days it has been live, front-loaded
 * (new listings get most attention early) with some day-to-day noise.
 */
export function dailyViews(listing: Listing, now: number, days: number) {
  const age = Math.max(7, listing.postedDaysAgo + 21);
  const rand = mulberry32(hash(listing.id));
  const weights = Array.from({ length: age }, (_, i) => Math.exp(-i / (age / 2.5)) * (0.6 + rand() * 0.8));
  const total = weights.reduce((a, b) => a + b, 0);
  const today = startOfDay(now);
  const out = new Map<number, number>();
  weights.forEach((w, i) => {
    const day = today - (age - 1 - i) * DAY;
    if (day > today - days * DAY) out.set(day, Math.round((w / total) * listing.views));
  });
  return out;
}

export function sellerSeries(listings: Listing[], sales: Order[], now: number, days: number): DayPoint[] {
  const today = startOfDay(now);
  const points = new Map<number, DayPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const day = today - i * DAY;
    points.set(day, { day, views: 0, saves: 0, orders: 0, revenue: 0 });
  }
  for (const l of listings) {
    const ratio = l.views ? l.saves / l.views : 0;
    for (const [day, views] of dailyViews(l, now, days)) {
      const p = points.get(day);
      if (!p) continue;
      p.views += views;
      p.saves += Math.round(views * ratio);
    }
  }
  for (const o of sales) {
    const p = points.get(startOfDay(o.placedAt));
    if (p) p.orders += o.quantity;
    const released = o.timeline.find((t) => t.status === "collected");
    const rp = released && points.get(startOfDay(released.at));
    if (rp) rp.revenue += o.amount;
  }
  return [...points.values()];
}

const sum = (points: DayPoint[], key: keyof Omit<DayPoint, "day">) => points.reduce((n, p) => n + p[key], 0);

/** Percentage change, or null when there's nothing to compare with. */
export const change = (current: number, previous: number) =>
  previous === 0 ? (current === 0 ? 0 : null) : (current - previous) / previous;

export function sellerSummary(listings: Listing[], sales: Order[], now: number, period: Period) {
  const both = sellerSeries(listings, sales, now, period * 2);
  const previous = both.slice(0, period);
  const current = both.slice(period);
  const totals = (p: DayPoint[]) => ({
    views: sum(p, "views"),
    saves: sum(p, "saves"),
    orders: sum(p, "orders"),
    revenue: sum(p, "revenue"),
  });
  const now_ = totals(current);
  const before = totals(previous);
  const conversion = now_.views ? now_.orders / now_.views : 0;
  const prevConversion = before.views ? before.orders / before.views : 0;
  const pending = sales.filter((o) => o.status === "paid" || o.status === "ready").reduce((n, o) => n + o.amount, 0);
  return {
    series: current,
    totals: now_,
    deltas: {
      views: change(now_.views, before.views),
      saves: change(now_.saves, before.saves),
      orders: change(now_.orders, before.orders),
      revenue: change(now_.revenue, before.revenue),
      conversion: change(conversion, prevConversion),
    },
    conversion,
    pending,
  };
}

export type ListingStats = { listing: Listing; views: number; saves: number; orders: number; revenue: number; conversion: number };

export function listingStats(listings: Listing[], sales: Order[]): ListingStats[] {
  return listings
    .filter((l) => l.status !== "draft")
    .map((l) => {
      const mine = sales.filter((o) => o.listingId === l.id);
      const orders = mine.reduce((n, o) => n + o.quantity, 0);
      const revenue = mine.filter((o) => o.status === "collected").reduce((n, o) => n + o.amount, 0);
      return { listing: l, views: l.views, saves: l.saves, orders, revenue, conversion: l.views ? orders / l.views : 0 };
    });
}

export type Insight = { id: string; tone: "tip" | "warning" | "good"; title: string; body: string; href?: string; action?: string };

/** Actionable suggestions from simple rules over the seller's listings. */
export function sellerInsights(listings: Listing[], categoryMedian: (categoryId: string) => number | null): Insight[] {
  const out: Insight[] = [];
  const active = listings.filter(isActive);
  for (const l of active) {
    if (l.images.length < 3)
      out.push({
        id: `photos-${l.id}`,
        tone: "tip",
        title: `Add photos to “${l.title}”`,
        body: "Listings with three or more photos get noticeably more views and saves.",
        href: `/sell?edit=${l.id}`,
        action: "Add photos",
      });
    if (l.postedDaysAgo >= 7)
      out.push({
        id: `stale-${l.id}`,
        tone: "warning",
        title: `“${l.title}” has been up for ${l.postedDaysAgo} days`,
        body: "Renew it to move it back to the top of Newest, or try a small price drop.",
        href: "/me?tab=selling",
        action: "Renew",
      });
    const median = categoryMedian(l.category);
    if (median && l.price > median * 1.4)
      out.push({
        id: `price-${l.id}`,
        tone: "tip",
        title: `“${l.title}” is priced above similar items`,
        body: `Most similar items sell for around GH₵${Math.round(median).toLocaleString()}. A lower price usually sells faster.`,
        href: `/sell?edit=${l.id}`,
        action: "Edit price",
      });
    if (l.stock === 0)
      out.push({
        id: `stock-${l.id}`,
        tone: "warning",
        title: `“${l.title}” is sold out`,
        body: "Restock it so buyers can keep ordering.",
        href: `/sell?edit=${l.id}`,
        action: "Restock",
      });
  }
  if (!out.length && active.length)
    out.push({
      id: "good",
      tone: "good",
      title: "Your listings look great",
      body: "Clear photos, fair prices and fresh listings. Keep it up.",
    });
  return out.slice(0, 6);
}

export function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
