import type { CategoryDef } from "./catalog";
import type { Condition, Listing, PickupSpot } from "./data";

export const sortOptions = {
  relevance: "Best match",
  newest: "Newest first",
  "price-asc": "Price, low to high",
  "price-desc": "Price, high to low",
  popular: "Most saved",
} as const;
export type SortKey = keyof typeof sortOptions;

export type Filters = {
  q: string;
  category: string | null;
  conditions: Condition[];
  pickup: PickupSpot[];
  min: number | null;
  max: number | null;
  sale: boolean;
  deals: boolean;
  /** Category attribute filters, e.g. { brand: ["Apple"], exam: ["true"] }. */
  attrs: Record<string, string[]>;
  sort: SortKey;
};

export const emptyFilters: Filters = {
  q: "",
  category: null,
  conditions: [],
  pickup: [],
  min: null,
  max: null,
  sale: false,
  deals: false,
  attrs: {},
  sort: "relevance",
};

const ATTR_PREFIX = "f.";
const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);
const num = (v: string | null) => (v && !Number.isNaN(Number(v)) ? Number(v) : null);

export function parseFilters(sp: URLSearchParams): Filters {
  const sort = sp.get("sort");
  const attrs: Record<string, string[]> = {};
  sp.forEach((value, key) => {
    if (key.startsWith(ATTR_PREFIX)) attrs[key.slice(ATTR_PREFIX.length)] = list(value);
  });
  return {
    q: sp.get("q") ?? "",
    category: sp.get("category") || null,
    conditions: list(sp.get("condition")) as Condition[],
    pickup: list(sp.get("pickup")) as PickupSpot[],
    min: num(sp.get("min")),
    max: num(sp.get("max")),
    sale: sp.get("sale") === "1",
    deals: sp.get("deals") === "1",
    attrs,
    sort: sort && sort in sortOptions ? (sort as SortKey) : "relevance",
  };
}

export function filtersToQuery(f: Filters) {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.category) sp.set("category", f.category);
  for (const [k, v] of Object.entries(f.attrs)) if (v.length) sp.set(ATTR_PREFIX + k, v.join(","));
  if (f.conditions.length) sp.set("condition", f.conditions.join(","));
  if (f.pickup.length) sp.set("pickup", f.pickup.join(","));
  if (f.min !== null) sp.set("min", String(f.min));
  if (f.max !== null) sp.set("max", String(f.max));
  if (f.sale) sp.set("sale", "1");
  if (f.deals) sp.set("deals", "1");
  if (f.sort !== "relevance") sp.set("sort", f.sort);
  return sp.toString();
}

const str = (v: unknown) => (typeof v === "boolean" ? String(v) : v === undefined ? "" : String(v));

/** Scores how well a listing matches a free-text query. 0 means no match. */
export function matchScore(listing: Listing, query: string, categoryLabel = "") {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return 1;
  const title = listing.title.toLowerCase();
  const rest = [
    listing.description,
    categoryLabel,
    ...Object.values(listing.attributes ?? {})
      .filter((v) => typeof v !== "boolean")
      .map(str),
    ...(listing.extra ?? []).flat(),
  ]
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (title.includes(t)) score += title.startsWith(t) ? 3 : 2;
    else if (rest.includes(t)) score += 1;
    else return 0;
  }
  return score;
}

export function applyFilters(all: Listing[], f: Filters, labelOf: (id: string) => string = () => "") {
  const attrEntries = Object.entries(f.attrs).filter(([, v]) => v.length);
  const scored = all
    .map((l) => ({ l, score: matchScore(l, f.q, labelOf(l.category)) }))
    .filter(
      ({ l, score }) =>
        score > 0 &&
        (!f.category || l.category === f.category) &&
        (!f.conditions.length || (l.condition && f.conditions.includes(l.condition))) &&
        (!f.pickup.length || f.pickup.includes(l.pickup)) &&
        (f.min === null || l.price >= f.min) &&
        (f.max === null || l.price <= f.max) &&
        (!f.sale || l.moveOut) &&
        (!f.deals || (l.originalPrice && l.originalPrice > l.price)) &&
        attrEntries.every(([k, values]) => values.includes(str(l.attributes?.[k]))),
    );

  scored.sort((a, b) => {
    switch (f.sort) {
      case "newest":
        return a.l.postedDaysAgo - b.l.postedDaysAgo;
      case "price-asc":
        return a.l.price - b.l.price;
      case "price-desc":
        return b.l.price - a.l.price;
      case "popular":
        return b.l.saves - a.l.saves;
      default:
        return b.score - a.score || Number(!!b.l.promoted) - Number(!!a.l.promoted) || b.l.saves - a.l.saves;
    }
  });
  return scored.map((s) => s.l);
}

/**
 * Value counts for one attribute, computed with every other active filter applied
 * but this attribute's own selection removed, so options never vanish once picked.
 */
export function attributeFacet(all: Listing[], f: Filters, key: string, labelOf?: (id: string) => string) {
  const rest = { ...f, attrs: { ...f.attrs, [key]: [] } };
  const counts = new Map<string, number>();
  for (const l of applyFilters(all, rest, labelOf)) {
    const v = l.attributes?.[key];
    if (v === undefined || v === "") continue;
    counts.set(str(v), (counts.get(str(v)) ?? 0) + 1);
  }
  return counts;
}

export function countActive(f: Filters) {
  return (
    (f.category ? 1 : 0) +
    f.conditions.length +
    f.pickup.length +
    (f.min !== null || f.max !== null ? 1 : 0) +
    (f.sale ? 1 : 0) +
    (f.deals ? 1 : 0) +
    Object.values(f.attrs).reduce((n, v) => n + v.length, 0)
  );
}

/** Attribute filters only make sense inside one category; drop them when the category changes. */
export function withCategory(f: Filters, category: string | null): Filters {
  return { ...f, category, attrs: category === f.category ? f.attrs : {} };
}

export function filterableAttributes(cat: CategoryDef | null) {
  return cat ? cat.attributes.filter((a) => a.filter && (a.type === "select" || a.type === "boolean")) : [];
}
