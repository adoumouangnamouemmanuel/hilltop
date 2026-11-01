import { describe, expect, it } from "vitest";
import { baseCategories, findCategory } from "@/lib/catalog";
import { listings, type Listing } from "@hilltop/shared/seed";
import {
  applyFilters,
  attributeFacet,
  countActive,
  emptyFilters,
  filterableAttributes,
  filtersToQuery,
  matchScore,
  parseFilters,
  withCategory,
  type Filters,
} from "@/lib/search";

const f = (patch: Partial<Filters>): Filters => ({ ...emptyFilters, ...patch });
const parse = (qs: string) => parseFilters(new URLSearchParams(qs));
const ids = (items: Listing[]) => items.map((l) => l.id);

describe("URL round trip", () => {
  it("keeps every filter through parse and serialise", () => {
    const filters = f({
      q: "iphone",
      category: "phones",
      conditions: ["Good", "Like new"],
      pickup: ["Library"],
      min: 500,
      max: 4000,
      sale: true,
      deals: true,
      attrs: { brand: ["Apple", "Samsung"], storage: ["128GB"] },
      sort: "price-asc",
    });
    expect(parse(filtersToQuery(filters))).toEqual(filters);
  });

  it("omits defaults so URLs stay short", () => {
    expect(filtersToQuery(emptyFilters)).toBe("");
    expect(filtersToQuery(f({ q: "casio" }))).toBe("q=casio");
  });

  it("encodes attribute filters with an f. prefix", () => {
    expect(filtersToQuery(f({ attrs: { brand: ["Apple"] } }))).toBe("f.brand=Apple");
    expect(parse("f.exam=true").attrs).toEqual({ exam: ["true"] });
  });

  it("ignores unknown sorts and non-numeric prices", () => {
    const parsed = parse("sort=cheapest&min=abc&max=200");
    expect(parsed.sort).toBe("relevance");
    expect(parsed.min).toBeNull();
    expect(parsed.max).toBe(200);
  });
});

describe("applyFilters", () => {
  it("filters by category", () => {
    const result = applyFilters(listings, f({ category: "calculators" }));
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((l) => l.category === "calculators")).toBe(true);
  });

  it("filters by category attributes, including booleans", () => {
    const apple = applyFilters(listings, f({ category: "audio", attrs: { brand: ["Apple"] } }));
    expect(apple.length).toBeGreaterThan(0);
    expect(apple.every((l) => l.attributes?.brand === "Apple")).toBe(true);

    const examSafe = applyFilters(listings, f({ category: "calculators", attrs: { exam: ["true"] } }));
    expect(ids(examSafe).sort()).toEqual(["casio-fx82", "casio-fx991", "casio-fx991ex"]);
    const classwiz = applyFilters(listings, f({ category: "calculators", attrs: { model: ["Casio fx-991EX"] } }));
    expect(ids(classwiz)).toEqual(["casio-fx991ex"]);
  });

  it("treats multiple values of one attribute as OR, and different attributes as AND", () => {
    const either = applyFilters(listings, f({ category: "jewellery", attrs: { type: ["Watch", "Earrings"] } }));
    expect(new Set(either.map((l) => l.attributes?.type))).toEqual(new Set(["Watch", "Earrings"]));

    const both = applyFilters(listings, f({ category: "jewellery", attrs: { type: ["Bracelet"], handmade: ["true"] } }));
    expect(ids(both)).toEqual(["beaded-bracelets"]);
  });

  it("applies the price range inclusively", () => {
    const result = applyFilters(listings, f({ min: 100, max: 180 }));
    expect(result.every((l) => l.price >= 100 && l.price <= 180)).toBe(true);
    expect(ids(result)).toContain("leather-watch"); // exactly 180
  });

  it("drops items without a condition when a condition is required", () => {
    const result = applyFilters(listings, f({ conditions: ["Good"] }));
    expect(result.some((l) => l.category === "food")).toBe(false);
  });

  it("supports deals and move-out filters", () => {
    expect(applyFilters(listings, f({ deals: true })).every((l) => l.originalPrice! > l.price)).toBe(true);
    expect(applyFilters(listings, f({ sale: true })).every((l) => l.moveOut)).toBe(true);
  });

  it("sorts by price both ways", () => {
    const asc = applyFilters(listings, f({ sort: "price-asc" })).map((l) => l.price);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = applyFilters(listings, f({ sort: "price-desc" })).map((l) => l.price);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });

  it("returns nothing for impossible combinations rather than throwing", () => {
    expect(applyFilters(listings, f({ category: "food", attrs: { brand: ["Apple"] } }))).toEqual([]);
    expect(applyFilters([], f({ q: "anything" }))).toEqual([]);
  });
});

describe("text search", () => {
  it("requires every word to match somewhere", () => {
    const l = listings.find((x) => x.id === "power-bank")!;
    expect(matchScore(l, "power 20,000mah")).toBeGreaterThan(0);
    expect(matchScore(l, "power samsung")).toBe(0);
  });

  it("ranks title matches above description matches", () => {
    const l = listings.find((x) => x.id === "casio-fx991")!;
    expect(matchScore(l, "casio")).toBeGreaterThan(matchScore(l, "calculus"));
  });

  it("matches attribute values and the category label", () => {
    const l = listings.find((x) => x.id === "eyecon-sunglasses")!;
    expect(matchScore(l, "acetate")).toBeGreaterThan(0);
    expect(matchScore(l, "glasses", "Glasses")).toBeGreaterThan(0);
  });

  it("matches everything for an empty query", () => {
    expect(applyFilters(listings, f({ q: "   " }))).toHaveLength(listings.length);
  });
});

describe("facets", () => {
  it("counts values ignoring the facet's own selection", () => {
    const filters = f({ category: "audio", attrs: { brand: ["Apple"] } });
    const counts = attributeFacet(listings, filters, "brand");
    expect(counts.get("Apple")).toBe(1);
    expect(counts.get("Other")).toBe(3);
  });

  it("respects the other active filters", () => {
    const counts = attributeFacet(listings, f({ category: "audio", max: 100 }), "brand");
    expect(counts.get("Apple")).toBe(1);
    expect(counts.get("Other")).toBe(1);
  });

  it("only offers select and boolean attributes as filters", () => {
    const phones = findCategory(baseCategories, "phones");
    const keys = filterableAttributes(phones).map((a) => a.key);
    expect(keys).toEqual(["brand", "storage", "network"]);
    expect(filterableAttributes(null)).toEqual([]);
  });
});

describe("filter bookkeeping", () => {
  it("counts active filters, each attribute value separately", () => {
    expect(countActive(emptyFilters)).toBe(0);
    expect(countActive(f({ category: "phones", min: 10, max: 20, attrs: { brand: ["Apple", "Samsung"] } }))).toBe(4);
  });

  it("clears attribute filters when switching category", () => {
    const filters = f({ category: "phones", attrs: { brand: ["Apple"] } });
    expect(withCategory(filters, "computers").attrs).toEqual({});
    expect(withCategory(filters, "phones").attrs).toEqual({ brand: ["Apple"] });
  });
});
