import { describe, expect, it } from "vitest";
import { baseCategories, findCategory, makeCustomCategory, slugify } from "@/lib/catalog";
import { getListing, listings } from "@/lib/data";
import { beforeCutoff, discountPercent, formatCedi, formatClock, protectionFee, relativeTime } from "@/lib/format";
import { paginate, queryListings } from "@/lib/queries";
import { factsFor, sellerFor, specsFor } from "@/lib/specs";

describe("queryListings", () => {
  const withStatuses = [
    { ...listings[0], id: "draft", status: "draft" as const },
    { ...listings[0], id: "sold", status: "sold" as const },
    ...listings,
  ];

  it("hides drafts and sold items by default", () => {
    const result = queryListings(withStatuses).map((l) => l.id);
    expect(result).not.toContain("draft");
    expect(result).not.toContain("sold");
  });

  it("can include sold items but never drafts", () => {
    const result = queryListings(withStatuses, { includeSold: true }).map((l) => l.id);
    expect(result).toContain("sold");
    expect(result).not.toContain("draft");
  });

  it("keeps the requested id order", () => {
    expect(queryListings(listings, { ids: ["kettle", "iphone-x", "missing"] }).map((l) => l.id)).toEqual(["kettle", "iphone-x"]);
  });

  it("combines filters, sorts and limits", () => {
    const result = queryListings(listings, { categories: ["jewellery", "eyewear"], maxPrice: 200, sort: "price-asc", limit: 3 });
    expect(result).toHaveLength(3);
    expect(result.every((l) => ["jewellery", "eyewear"].includes(l.category) && l.price <= 200)).toBe(true);
    expect(result.map((l) => l.price)).toEqual([...result.map((l) => l.price)].sort((a, b) => a - b));
  });

  it("paginates", () => {
    const page = paginate([1, 2, 3, 4, 5], 2, 2);
    expect(page).toEqual({ items: [1, 2, 3, 4], total: 5, hasMore: true });
    expect(paginate([1, 2], 1, 5).hasMore).toBe(false);
  });
});

describe("specs", () => {
  it("labels attributes with units and hides 'Other'", () => {
    const phone = getListing("iphone-12")!;
    const specs = specsFor(phone, findCategory(baseCategories, "phones"));
    expect(specs.find((s) => s.label === "Battery health")?.value).toBe("84%");
    const keyboard = getListing("mechanical-keyboard")!;
    expect(specsFor(keyboard, findCategory(baseCategories, "computers")).some((s) => s.value === "Other")).toBe(false);
  });

  it("shows booleans as Yes/No and only highlights true ones", () => {
    const casio = specsFor(getListing("casio-fx991")!, findCategory(baseCategories, "calculators"));
    expect(casio.find((s) => s.label === "Allowed in exams")).toEqual({ label: "Allowed in exams", value: "Yes", highlight: true });
  });

  it("keeps values the schema doesn't know about", () => {
    const l = { ...getListing("kettle")!, attributes: { colour: "Silver" } };
    expect(specsFor(l, makeCustomCategory("Kitchen"))).toEqual([{ label: "Colour", value: "Silver", highlight: false }]);
  });

  it("builds the details table with stock and pickup", () => {
    const facts = Object.fromEntries(factsFor(getListing("choc-chip-cookies")!, findCategory(baseCategories, "food")));
    expect(facts.Available).toBe("12 left");
    expect(facts.Pickup).toBe("Hostel A, Ashesi campus");
    expect(facts.Condition).toBeUndefined();
  });

  it("stands in for the current user as seller", () => {
    expect(sellerFor({ ...getListing("kettle")!, sellerId: "me" }, "Kofi Darko")).toMatchObject({ name: "Kofi Darko", isMe: true });
    expect(sellerFor(getListing("kettle")!).isMe).toBe(false);
  });
});

describe("catalog", () => {
  it("slugifies labels for custom category ids", () => {
    expect(slugify("Music & Instruments!")).toBe("music-and-instruments");
    expect(makeCustomCategory("  Plants ").id).toBe("c-plants");
  });

  it("falls back gracefully for unknown categories", () => {
    expect(findCategory(baseCategories, "c-board-games").label).toBe("Board games");
  });
});

describe("format", () => {
  it("formats cedis", () => {
    expect(formatCedi(950)).toBe("GH₵950");
    expect(formatCedi(1175.2)).toBe("GH₵1,175.20");
  });

  it("computes the protection fee at the configured rate, and discounts", () => {
    expect(protectionFee(950, 0.04)).toBe(38);
    expect(protectionFee(166, 0.04)).toBe(6.64);
    expect(protectionFee(100, 0.025)).toBe(2.5);
    expect(discountPercent(6800, 8500)).toBe(20);
    expect(discountPercent(100)).toBe(0);
  });

  it("describes relative times", () => {
    const now = Date.UTC(2026, 9, 31, 12);
    expect(relativeTime(now - 10_000, now)).toBe("Just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(relativeTime(now - 30 * 3_600_000, now)).toBe("Yesterday");
    expect(relativeTime(now - 4 * 86_400_000, now)).toBe("4 days ago");
    expect(relativeTime(now - 20 * 86_400_000, now)).toBe("11 Oct");
  });

  it("checks food cut-offs in Ghana time", () => {
    expect(beforeCutoff("11:00", Date.UTC(2026, 9, 31, 10, 59))).toBe(true);
    expect(beforeCutoff("11:00", Date.UTC(2026, 9, 31, 11, 0))).toBe(false);
    expect(formatClock("11:00")).toBe("11am");
    expect(formatClock("15:30")).toBe("3:30pm");
    expect(formatClock("00:00")).toBe("12am");
  });
});
