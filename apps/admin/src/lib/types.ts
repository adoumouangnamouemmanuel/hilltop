import type { PlatformConfig } from "@hilltop/shared/config";
import type { Permission, Role } from "@hilltop/shared/permissions";

/*
 * Admin domain types. They mirror what the backend will return, so the screens
 * won't change when the mock store is swapped for API calls.
 */

export type Member = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  status: "active" | "invited";
  invitedAt: number;
  lastActiveAt?: number;
};

export type UserStatus = "active" | "suspended";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  classOf: number;
  major: string;
  status: UserStatus;
  verified: boolean;
  joinedAt: number;
  listings: number;
  sales: number;
  purchases: number;
  rating: number | null;
  /** Reports filed against this user's listings. */
  reports: number;
};

export type ListingState = "live" | "hidden" | "removed" | "sold";

export type Report = { id: string; reason: string; by: string; at: number };

export type ModListing = {
  id: string;
  title: string;
  price: number;
  category: string;
  image: string;
  sellerId: string;
  sellerName: string;
  state: ListingState;
  featured: boolean;
  views: number;
  saves: number;
  postedAt: number;
  reports: Report[];
};

export type OrderStatus = "paid" | "ready" | "collected" | "disputed" | "refunded";

export type AdminOrder = {
  id: string;
  listingId: string;
  title: string;
  category: string;
  buyer: string;
  seller: string;
  amount: number;
  fee: number;
  method: string;
  pickup: string;
  status: OrderStatus;
  placedAt: number;
};

export type DisputeState = "open" | "refunded" | "released";

export type AdminDispute = {
  id: string;
  orderId: string;
  reason: string;
  details: string;
  openedAt: number;
  state: DisputeState;
  messages: { from: "buyer" | "seller" | "admin"; name: string; text: string; at: number }[];
  resolution?: { by: string; at: number; note: string };
};

export type AuditEntry = {
  id: string;
  at: number;
  actor: string;
  /** The permission the action used, which doubles as its category. */
  permission: Permission | "session";
  action: string;
  target?: string;
};

export type AdminState = {
  /** Unpublished edits to the platform config. Null when there are none. */
  draft: PlatformConfig | null;
  roles: Role[];
  team: Member[];
  sessionId: string | null;
  users: AdminUser[];
  listings: ModListing[];
  orders: AdminOrder[];
  disputes: AdminDispute[];
  audit: AuditEntry[];
};
