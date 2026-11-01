import { describe, expect, it } from "vitest";
import { defaultConfig } from "@hilltop/shared/config";
import { toCsv } from "@/lib/csv";
import { byCategory, delta, disputeDue, gmvSeries, overview } from "@/lib/metrics";
import { DAY } from "@/lib/seed";
import type { AdminOrder } from "@/lib/types";

const NOW = Date.UTC(2026, 10, 1, 12);
const order = (daysAgo: number, amount: number, extra: Partial<AdminOrder> = {}): AdminOrder => ({
  id: `o${daysAgo}-${amount}`,
  listingId: "l",
  title: "Item",
  category: "phones",
  buyer: "A",
  seller: "B",
  amount,
  fee: amount * 0.04,
  method: "MTN",
  pickup: "Library",
  status: "collected",
  placedAt: NOW - daysAgo * DAY,
  ...extra,
});

describe("metrics", () => {
  it("builds one point per day and skips refunds", () => {
    const series = gmvSeries([order(0, 100), order(0, 50, { status: "refunded" }), order(2, 30)], NOW, 7);
    expect(series).toHaveLength(7);
    expect(series.at(-1)!.y).toBe(100);
    expect(series.at(-3)!.y).toBe(30);
  });

  it("compares with the previous period", () => {
    const o = overview([order(1, 200), order(10, 100)], NOW, 7, defaultConfig);
    expect(o.current.gmv).toBe(200);
    expect(o.deltas.gmv).toBe(1);
    expect(o.current.revenue).toBe(8);
  });

  it("includes the seller fee in revenue", () => {
    const o = overview([order(1, 100)], NOW, 7, { fees: { buyerProtectionRate: 0.04, sellerFeeRate: 0.05 } });
    expect(o.current.revenue).toBe(9);
  });

  it("ranks categories", () => {
    expect(byCategory([order(1, 10), order(1, 50, { category: "books" })], NOW, 7).map((c) => c.category)).toEqual(["books", "phones"]);
  });

  it("handles empty comparisons and due times", () => {
    expect(delta(5, 0)).toBeNull();
    expect(disputeDue(0, 24)).toBe(24 * 3_600_000);
  });
});

describe("csv", () => {
  it("quotes values and neutralises formulas", () => {
    expect(toCsv([{ a: 'He said "hi", ok', b: "=SUM(A1)" }])).toBe(`a,b\n"He said ""hi"", ok",'=SUM(A1)`);
  });
});
