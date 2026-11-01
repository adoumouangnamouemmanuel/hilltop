import { describe, expect, it } from "vitest";
import { baseCategories, findCategory } from "@/lib/catalog";
import { defaultConfig, type PlatformConfig } from "@hilltop/shared/config";
import { getListing } from "@/lib/data";
import { buildListingSchema, draftProblem, emptyListingForm, fromListing, toListing, type ListingFormValues } from "@/lib/validation";

const cat = (id: string) => findCategory(baseCategories, id);
const empty = emptyListingForm(defaultConfig);
const form = (patch: Partial<ListingFormValues>): ListingFormValues => ({ ...empty, ...patch });
const valid = form({ photos: ["x.jpg"], title: "iPhone 12 128GB", category: "phones", condition: "Good", price: "3200" });

const issues = (category: string | null, values: ListingFormValues, config: PlatformConfig = defaultConfig) => {
  const result = buildListingSchema(category ? cat(category) : null, config).safeParse(values);
  return result.success ? {} : Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("listing schema", () => {
  it("accepts a complete listing", () => {
    expect(issues("phones", valid)).toEqual({});
  });

  it("explains every missing basic", () => {
    const errors = issues("phones", form({}));
    expect(errors).toMatchObject({
      photos: "Add at least one photo",
      title: "Give your item a clear title",
      category: "Pick a category",
      condition: "Pick a condition",
      price: "Set a price",
    });
  });

  it("rejects values outside a select attribute's options", () => {
    expect(issues("phones", { ...valid, attributes: { storage: "1PB" } })).toHaveProperty("attributes.storage");
    expect(issues("phones", { ...valid, attributes: { storage: "128GB" } })).toEqual({});
  });

  it("caps percentage attributes at 100", () => {
    expect(issues("phones", { ...valid, attributes: { battery: 140 } })).toHaveProperty("attributes.battery");
    expect(issues("phones", { ...valid, attributes: { battery: 84 } })).toEqual({});
  });

  it("checks prices are numbers and the original is higher", () => {
    expect(issues("phones", { ...valid, price: "abc" })).toHaveProperty("price", "Price must be a number");
    expect(issues("phones", { ...valid, originalPrice: "3000" })).toHaveProperty("originalPrice");
    expect(issues("phones", { ...valid, originalPrice: "4500" })).toEqual({});
  });

  it("requires whole-number quantities", () => {
    expect(issues("phones", { ...valid, stock: "2.5" })).toHaveProperty("stock");
    expect(issues("phones", { ...valid, stock: "3" })).toEqual({});
  });

  it("doesn't need a condition for food but does need pickup windows", () => {
    const food = form({ photos: ["x.jpg"], title: "Cookies, box of 6", category: "food", price: "35" });
    expect(issues("food", food)).toEqual({});
    expect(issues("food", { ...food, foodSlots: [] })).toHaveProperty("foodSlots");
    expect(issues("food", { ...food, foodCutoff: "25:00" })).toHaveProperty("foodCutoff");
  });

  it("follows the configured limits, conditions, spots and plans", () => {
    const strict: PlatformConfig = {
      ...defaultConfig,
      listings: { ...defaultConfig.listings, maxPhotos: 1, titleMax: 20, maxPrice: 1000 },
      conditions: [{ value: "Used", help: "" }],
      pickupSpots: ["Gate"],
      boostPlans: defaultConfig.boostPlans.map((p) => ({ ...p, enabled: p.id !== "week" })),
    };
    const v = { ...valid, photos: ["a", "b"], title: "A very long title for this one", price: "3200", pickup: "Library", boost: "week" };
    const errors = issues("phones", v, strict);
    expect(errors).toHaveProperty("photos", "Up to 1 photos");
    expect(errors).toHaveProperty("title", "Keep the title under 20 characters");
    expect(errors).toHaveProperty("price");
    expect(errors).toHaveProperty("condition");
    expect(errors).toHaveProperty("pickup");
    expect(errors).toHaveProperty("boost");
  });

  it("blocks banned words in the title and description", () => {
    const config = { ...defaultConfig, listings: { ...defaultConfig.listings, bannedWords: ["replica"] } };
    expect(issues("phones", { ...valid, title: "Replica iPhone 12" }, config)).toHaveProperty("title", "The title can't include “replica”");
    expect(issues("phones", { ...valid, description: "not a replica" }, config)).toHaveProperty("description");
    // Whole words only.
    expect(issues("phones", { ...valid, title: "iPhone 12 replicable" }, config)).toEqual({});
  });

  it("works for the catch-all category", () => {
    const other = findCategory(baseCategories, "other");
    const result = buildListingSchema(other, defaultConfig).safeParse({ ...valid, category: other.id, attributes: {} });
    expect(result.success).toBe(true);
  });
});

describe("form conversion", () => {
  it("round-trips a listing through the form", () => {
    const original = getListing("iphone-12")!;
    const listing = toListing(fromListing(original, defaultConfig), { id: original.id, status: "active", previous: original });
    expect(listing).toMatchObject({
      title: original.title,
      price: original.price,
      originalPrice: original.originalPrice,
      attributes: original.attributes,
      images: original.images,
      pickup: original.pickup,
    });
  });

  it("drops empty values and blank extra rows", () => {
    const listing = toListing(
      {
        ...valid,
        attributes: { brand: "Apple", model: "" },
        extra: [
          { label: " ", value: "x" },
          { label: "Warranty", value: "6 months" },
        ],
      },
      { id: "my-1", status: "active" },
    );
    expect(listing.attributes).toEqual({ brand: "Apple" });
    expect(listing.extra).toEqual([["Warranty", "6 months"]]);
    expect(listing.sellerId).toBe("me");
  });

  it("ignores an original price that isn't higher", () => {
    expect(toListing({ ...valid, originalPrice: "100" }, { id: "x", status: "active" }).originalPrice).toBeUndefined();
  });

  it("keeps food ordering details only for food", () => {
    expect(toListing({ ...valid, category: "food" }, { id: "x", status: "active" }, true).food).toEqual({
      cutoff: empty.foodCutoff,
      slots: empty.foodSlots,
    });
    expect(toListing(valid, { id: "x", status: "active" }).food).toBeUndefined();
  });
});

describe("drafts", () => {
  it("need a title or a photo", () => {
    expect(draftProblem({ title: " ", photos: [] })).toMatch(/title or a photo/);
    expect(draftProblem({ title: "Lamp", photos: [] })).toBeNull();
    expect(draftProblem({ title: "", photos: ["x"] })).toBeNull();
  });
});
