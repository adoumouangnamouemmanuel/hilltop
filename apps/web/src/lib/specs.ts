import type { CategoryDef } from "./catalog";
import { getSeller, type AttrValue, type Listing, type Seller } from "./data";
import { postedLabel } from "./format";

export type Spec = { label: string; value: string; highlight: boolean };

const display = (v: AttrValue, unit?: string) => (typeof v === "boolean" ? (v ? "Yes" : "No") : `${v}${unit ?? ""}`);

/** Turns a listing's attribute values into labelled specs using its category schema. */
export function specsFor(listing: Listing, category: CategoryDef): Spec[] {
  const values = listing.attributes ?? {};
  const known = category.attributes
    .filter((a) => values[a.key] !== undefined && values[a.key] !== "" && values[a.key] !== "Other")
    .map((a) => ({ label: a.label, value: display(values[a.key], a.unit), highlight: a.type !== "boolean" || values[a.key] === true }));
  // Values for keys the schema doesn't know (e.g. after a category changes) still show up.
  const unknown = Object.entries(values)
    .filter(([k]) => !category.attributes.some((a) => a.key === k))
    .map(([k, v]) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), value: display(v), highlight: false }));
  return [...known, ...unknown];
}

/** The full details table for a listing page. */
export function factsFor(listing: Listing, category: CategoryDef): [string, string][] {
  return [
    ...(listing.condition ? [["Condition", listing.condition] as [string, string]] : []),
    ["Category", category.label],
    ...specsFor(listing, category).map((s) => [s.label, s.value] as [string, string]),
    ...(listing.extra ?? []),
    ...(listing.stock !== undefined ? [["Available", listing.stock > 0 ? `${listing.stock} left` : "Sold out"] as [string, string]] : []),
    ["Pickup", `${listing.pickup}, Ashesi campus`],
    ["Listed", postedLabel(listing.postedDaysAgo)],
  ];
}

/**
 * Seller profile for a listing. The signed-in student's own listings may not be in
 * the public market yet (drafts, or just published), so they get a stand-in.
 */
export function sellerFor(listing: Listing, me?: { handle?: string; name: string } | null): Seller & { isMe: boolean } {
  const isMe = !!me?.handle && listing.sellerId === me.handle;
  const seller = getSeller(listing.sellerId);
  if (seller) return { ...seller, isMe };
  return {
    id: listing.sellerId,
    name: isMe ? me!.name : "A student",
    specialty: "Ashesi student",
    rating: 0,
    reviews: 0,
    sales: 0,
    responseTime: "within an hour",
    joined: String(new Date().getFullYear()),
    isMe,
  };
}
