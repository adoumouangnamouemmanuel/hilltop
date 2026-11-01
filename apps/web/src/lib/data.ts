// Listing and seller types are shared with the admin portal. The records themselves
// come from the database (see market.ts).
export type { AttrValue, Condition, FoodOrdering, Listing, ListingStatus, PickupSpot, Seller } from "@hilltop/shared/seed";
import { findMarketListing, findSeller } from "./market";

export const getListing = findMarketListing;
export const getSeller = findSeller;
