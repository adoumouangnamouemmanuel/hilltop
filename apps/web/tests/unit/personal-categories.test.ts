import { describe, expect, it } from "vitest";
import type { CategoryDef } from "@hilltop/shared/catalog";
import { personalOrder } from "@/lib/use-catalog";

const cats = ["phones", "books", "fashion", "food"].map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) }) as CategoryDef);
const categoryOf = (id: string) => ({ l1: "food", l2: "fashion", l3: "books" })[id];
const none = { viewed: [], saved: [], ordered: [], searches: [] };

describe("personalOrder", () => {
  it("keeps the catalogue order with no history", () => {
    expect(personalOrder(cats, none, categoryOf).map((c) => c.id)).toEqual(["phones", "books", "fashion", "food"]);
  });

  it("puts what a student buys, saves, views and searches first", () => {
    const order = personalOrder(cats, { ...none, viewed: ["l2"], ordered: ["l1"], searches: ["cheap books"] }, categoryOf);
    expect(order.map((c) => c.id)).toEqual(["food", "fashion", "books", "phones"]);
  });
});
