import { describe, expect, it } from "vitest";
import { baseCategories, findCategory, makeCustomCategory } from "@/lib/catalog";
import { getListing } from "@/lib/data";
import { buildListingSchema, draftProblem, emptyListingForm, fromListing, toListing, type ListingFormValues } from "@/lib/validation";

const cat = (id: string) => findCategory(baseCategories, id);
const form = (patch: Partial<ListingFormValues>): ListingFormValues => ({ ...emptyListingForm, ...patch });
const valid = form({ photos: ["x.jpg"], title: "iPhone 12 128GB", category: "phones", condition: "Good", price: "3200" });

const issues = (category: string | null, values: ListingFormValues) => {
  const result = buildListingSchema(category ? cat(category) : null).safeParse(values);
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

  it("works for seller-created categories", () => {
    const custom = makeCustomCategory("Musical instruments");
    const result = buildListingSchema(custom).safeParse({ ...valid, category: custom.id, attributes: { brand: "Yamaha" } });
    expect(result.success).toBe(true);
  });
});

describe("form conversion", () => {
  it("round-trips a listing through the form", () => {
    const original = getListing("iphone-12")!;
    const listing = toListing(fromListing(original), { id: original.id, status: "active", previous: original });
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
      cutoff: emptyListingForm.foodCutoff,
      slots: emptyListingForm.foodSlots,
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
