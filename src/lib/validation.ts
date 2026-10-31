import { z } from "zod";
import type { AttributeDef, CategoryDef } from "./catalog";
import { conditions, pickupSpots, type AttrValue, type Condition, type Listing, type PickupSpot } from "./data";

/*
 * Listing validation generated from a category's schema. The same function can run
 * on the server to check submissions, so client and API rules never drift apart.
 */

export const MAX_PHOTOS = 8;
export const TITLE_MAX = 70;
export const DESCRIPTION_MAX = 800;
const MAX_PRICE = 100_000;

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
  boost: "none" | "day" | "week";
  moveOut: boolean;
  foodCutoff: string;
  foodSlots: string[];
};

export const emptyListingForm: ListingFormValues = {
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
  pickup: pickupSpots[0],
  boost: "none",
  moveOut: false,
  foodCutoff: "11:00",
  foodSlots: ["12:00 to 13:00"],
};

const numberText = (label: string, { min = 0, max = MAX_PRICE } = {}) =>
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

export function buildListingSchema(category: CategoryDef | null | undefined) {
  const attributes = z.object(Object.fromEntries((category?.attributes ?? []).map((a) => [a.key, attributeSchema(a)])));
  const isFood = category?.id === "food";

  return z
    .object({
      photos: z.array(z.string()).min(1, "Add at least one photo").max(MAX_PHOTOS, `Up to ${MAX_PHOTOS} photos`),
      title: z.string().trim().min(4, "Give your item a clear title").max(TITLE_MAX, `Keep the title under ${TITLE_MAX} characters`),
      category: z.string().min(1, "Pick a category"),
      attributes,
      extra: z.array(z.object({ label: z.string().trim().max(30), value: z.string().trim().max(60) })).max(10, "Up to 10 extra details"),
      condition: category?.noCondition ? z.enum(conditions).optional() : z.enum(conditions, { error: "Pick a condition" }),
      price: numberText("Price", { min: 1 }).refine((v) => v !== "", "Set a price"),
      originalPrice: numberText("Original price"),
      stock: numberText("Quantity", { min: 1, max: 999 }).refine(
        (v) => v === "" || Number.isInteger(Number(v)),
        "Quantity must be a whole number",
      ),
      description: z.string().max(DESCRIPTION_MAX, `Keep the description under ${DESCRIPTION_MAX} characters`),
      pickup: z.enum(pickupSpots),
      boost: z.enum(["none", "day", "week"]),
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
    sellerId: "me",
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
export function fromListing(l: Listing): ListingFormValues {
  return {
    ...emptyListingForm,
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
    foodCutoff: l.food?.cutoff ?? emptyListingForm.foodCutoff,
    foodSlots: l.food?.slots ?? emptyListingForm.foodSlots,
  };
}
