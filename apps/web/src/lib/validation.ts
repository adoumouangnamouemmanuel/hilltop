import { z } from "zod";
import { enabledBoostPlans, findBannedWord, type PlatformConfig } from "@hilltop/shared/config";
import type { AttributeDef, CategoryDef } from "./catalog";
import type { AttrValue, Condition, Listing, PickupSpot } from "./data";

/*
 * Listing validation generated from a category's schema and the platform config
 * (limits, conditions, pickup spots, banned words). The same function can run on
 * the server to check submissions, so client and API rules never drift apart.
 */

export type ListingFormValues = {
  photos: string[];
  title: string;
  category: string;
  attributes: Record<string, AttrValue | "" | undefined>;
  extra: { label: string; value: string }[];
  condition?: Condition;
  /** Numeric fields are kept as strings while typing. */
  price: string;
  originalPrice: string;
  stock: string;
  description: string;
  pickup: PickupSpot;
  /** "none" or the id of a promotion plan from the config. */
  boost: string;
  moveOut: boolean;
  foodCutoff: string;
  foodSlots: string[];
};

export function emptyListingForm(config: Pick<PlatformConfig, "pickupSpots">): ListingFormValues {
  return {
    photos: [],
    title: "",
    category: "",
    attributes: {},
    extra: [],
    condition: undefined,
    price: "",
    originalPrice: "",
    stock: "",
    description: "",
    pickup: config.pickupSpots[0],
    boost: "none",
    moveOut: false,
    foodCutoff: "11:00",
    foodSlots: ["12:00 to 13:00"],
  };
}

const numberText = (label: string, { min = 0, max = 100_000 } = {}) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), `${label} must be a number`)
    // Only range-check real numbers, so "abc" gets the "must be a number" message alone.
    .refine(
      (v) => v === "" || Number.isNaN(Number(v)) || (Number(v) >= min && Number(v) <= max),
      `${label} must be between ${min} and ${max.toLocaleString()}`,
    );

function attributeSchema(a: AttributeDef) {
  switch (a.type) {
    case "boolean":
      return z.boolean().optional();
    case "number":
      return z
        .union([
          z
            .number()
            .min(0)
            .max(a.unit === "%" ? 100 : 1_000_000),
          z.literal(""),
        ])
        .optional();
    case "select":
      return z.union([z.enum((a.options ?? []) as [string, ...string[]]), z.literal("")]).optional();
    default:
      return z.string().trim().max(80, `${a.label} is too long`).optional();
  }
}

export type ListingRules = Pick<PlatformConfig, "listings" | "conditions" | "pickupSpots" | "boostPlans">;

export function buildListingSchema(category: CategoryDef | null | undefined, rules: ListingRules) {
  const { maxPhotos, titleMax, descriptionMax, maxPrice, bannedWords } = rules.listings;
  const attributes = z.object(Object.fromEntries((category?.attributes ?? []).map((a) => [a.key, attributeSchema(a)])));
  const isFood = category?.id === "food";
  const conditionValues = rules.conditions.map((c) => c.value) as [string, ...string[]];
  const boostIds = ["none", ...enabledBoostPlans(rules as PlatformConfig).map((p) => p.id)] as [string, ...string[]];
  const clean = (label: string) => (v: string) => {
    const word = findBannedWord(v, bannedWords);
    return word ? `${label} can't include “${word}”` : null;
  };

  return z
    .object({
      photos: z.array(z.string()).min(1, "Add at least one photo").max(maxPhotos, `Up to ${maxPhotos} photos`),
      title: z.string().trim().min(4, "Give your item a clear title").max(titleMax, `Keep the title under ${titleMax} characters`),
      category: z.string().min(1, "Pick a category"),
      attributes,
      extra: z.array(z.object({ label: z.string().trim().max(30), value: z.string().trim().max(60) })).max(10, "Up to 10 extra details"),
      condition: category?.noCondition ? z.enum(conditionValues).optional() : z.enum(conditionValues, { error: "Pick a condition" }),
      price: numberText("Price", { min: 1, max: maxPrice }).refine((v) => v !== "", "Set a price"),
      originalPrice: numberText("Original price", { max: maxPrice }),
      stock: numberText("Quantity", { min: 1, max: 999 }).refine(
        (v) => v === "" || Number.isInteger(Number(v)),
        "Quantity must be a whole number",
      ),
      description: z.string().max(descriptionMax, `Keep the description under ${descriptionMax} characters`),
      pickup: z.enum(rules.pickupSpots as [string, ...string[]], { error: "Pick a pickup spot" }),
      boost: z.enum(boostIds, { error: "That promotion isn't available" }),
      moveOut: z.boolean(),
      foodCutoff: isFood ? z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 11:00") : z.string(),
      foodSlots: isFood
        ? z.array(z.string().trim().min(3, "Describe the pickup window")).min(1, "Add at least one pickup window")
        : z.array(z.string()),
    })
    .superRefine((v, ctx) => {
      if (v.originalPrice && v.price && Number(v.originalPrice) <= Number(v.price)) {
        ctx.addIssue({ code: "custom", path: ["originalPrice"], message: "Original price should be higher than your price" });
      }
      for (const [field, label] of [
        ["title", "The title"],
        ["description", "The description"],
      ] as const) {
        const problem = clean(label)(v[field]);
        if (problem) ctx.addIssue({ code: "custom", path: [field], message: problem });
      }
    });
}

/** Drafts only need something to recognise them by. */
export function draftProblem(v: Pick<ListingFormValues, "title" | "photos">) {
  return v.title.trim() || v.photos.length ? null : "Add a title or a photo to save a draft";
}

/** Form values into a listing record. Empty optional values are dropped. */
export function toListing(
  v: ListingFormValues,
  meta: { id: string; status: Listing["status"]; previous?: Listing },
  noCondition = false,
): Listing {
  const attributes = Object.fromEntries(Object.entries(v.attributes).filter(([, x]) => x !== "" && x !== undefined)) as Record<
    string,
    AttrValue
  >;
  const price = Number(v.price) || 0;
  const original = Number(v.originalPrice) || 0;
  return {
    id: meta.id,
    revision: meta.previous?.revision,
    title: v.title.trim(),
    price,
    originalPrice: original > price ? original : undefined,
    category: v.category,
    condition: noCondition ? undefined : v.condition,
    images: v.photos,
    description: v.description.trim() || "No description yet.",
    attributes,
    extra: v.extra.filter((e) => e.label.trim() && e.value.trim()).map((e) => [e.label.trim(), e.value.trim()]),
    stock: v.stock ? Number(v.stock) : undefined,
    food: v.category === "food" ? { cutoff: v.foodCutoff, slots: v.foodSlots.map((s) => s.trim()).filter(Boolean) } : undefined,
    // Set to the seller's handle when saved.
    sellerId: "",
    pickup: v.pickup,
    postedDaysAgo: meta.previous?.postedDaysAgo ?? 0,
    promoted: v.boost !== "none" || meta.previous?.promoted,
    moveOut: v.moveOut,
    status: meta.status,
    saves: meta.previous?.saves ?? 0,
    views: meta.previous?.views ?? 0,
  };
}

/** A listing back into editable form values. */
export function fromListing(l: Listing, config: Pick<PlatformConfig, "pickupSpots">): ListingFormValues {
  const empty = emptyListingForm(config);
  return {
    ...empty,
    photos: l.images,
    title: l.title,
    category: l.category,
    attributes: { ...(l.attributes ?? {}) },
    extra: (l.extra ?? []).map(([label, value]) => ({ label, value })),
    condition: l.condition,
    price: String(l.price),
    originalPrice: l.originalPrice ? String(l.originalPrice) : "",
    stock: l.stock !== undefined ? String(l.stock) : "",
    description: l.description === "No description yet." ? "" : l.description,
    pickup: l.pickup,
    moveOut: !!l.moveOut,
    foodCutoff: l.food?.cutoff ?? empty.foodCutoff,
    foodSlots: l.food?.slots ?? empty.foodSlots,
  };
}
