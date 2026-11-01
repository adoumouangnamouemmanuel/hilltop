import type { PlatformConfig } from "@hilltop/shared/config";
import { DAY } from "./seed";
import type { AdminOrder } from "./types";

/* Platform metrics for the overview, computed from orders. */

export type Period = 7 | 30 | 90;

const startOfDay = (t: number) => Math.floor(t / DAY) * DAY;
const counts = (o: AdminOrder) => o.status !== "refunded";

/** Gross merchandise value per day over the last `days` days. */
export function gmvSeries(orders: AdminOrder[], now: number, days: number) {
  const today = startOfDay(now);
  const map = new Map<number, number>();
  for (let i = days - 1; i >= 0; i--) map.set(today - i * DAY, 0);
  for (const o of orders) {
    const d = startOfDay(o.placedAt);
    if (counts(o) && map.has(d)) map.set(d, map.get(d)! + o.amount);
  }
  return [...map].map(([x, y]) => ({ x, y }));
}

function totals(orders: AdminOrder[], from: number, to: number, config: Pick<PlatformConfig, "fees">) {
  const inRange = orders.filter((o) => o.placedAt >= from && o.placedAt < to);
  const valid = inRange.filter(counts);
  const gmv = valid.reduce((n, o) => n + o.amount, 0);
  // Revenue: buyer protection fees plus the seller fee, at the configured rates.
  const revenue = valid.reduce((n, o) => n + o.fee, 0) + gmv * config.fees.sellerFeeRate;
  const people = new Set(inRange.flatMap((o) => [o.buyer, o.seller]));
  return { gmv, revenue, orders: valid.length, refunds: inRange.length - valid.length, activeUsers: people.size };
}

export const delta = (current: number, previous: number) => (previous === 0 ? null : (current - previous) / previous);

export function overview(orders: AdminOrder[], now: number, period: Period, config: Pick<PlatformConfig, "fees">) {
  const end = startOfDay(now) + DAY;
  const current = totals(orders, end - period * DAY, end, config);
  const previous = totals(orders, end - 2 * period * DAY, end - period * DAY, config);
  return {
    current,
    deltas: {
      gmv: delta(current.gmv, previous.gmv),
      revenue: delta(current.revenue, previous.revenue),
      orders: delta(current.orders, previous.orders),
      activeUsers: delta(current.activeUsers, previous.activeUsers),
    },
    series: gmvSeries(orders, now, period),
  };
}

/** GMV by category over the period, largest first. */
export function byCategory(orders: AdminOrder[], now: number, period: Period) {
  const from = startOfDay(now) + DAY - period * DAY;
  const map = new Map<string, number>();
  for (const o of orders) if (o.placedAt >= from && counts(o)) map.set(o.category, (map.get(o.category) ?? 0) + o.amount);
  return [...map].map(([category, gmv]) => ({ category, gmv })).sort((a, b) => b.gmv - a.gmv);
}

/** When an open dispute must be answered, from the configured response time. */
export const disputeDue = (openedAt: number, responseHours: number) => openedAt + responseHours * 3_600_000;
