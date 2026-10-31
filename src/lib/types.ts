import type { CategoryDef } from "./catalog";
import type { Listing, ListingStatus } from "./data";

/*
 * Domain types for everything the user does. These mirror what the backend
 * will return, so the UI won't change when the mock store is replaced.
 */

export type User = { name: string; email: string };

/**
 * paid      money is held, seller hasn't prepared the item yet
 * ready     seller marked it ready for pickup
 * collected buyer confirmed, payout released to the seller
 * disputed  buyer reported a problem, payout frozen
 * refunded  dispute upheld, buyer refunded
 */
export type OrderStatus = "paid" | "ready" | "collected" | "disputed" | "refunded";

export type DisputeReason = "not-as-described" | "damaged" | "no-show" | "wrong-item" | "other";

export type Dispute = {
  reason: DisputeReason;
  details: string;
  openedAt: number;
  state: "open" | "withdrawn" | "refunded";
};

export type Order = {
  id: string;
  listingId: string;
  /** Whether the signed-in user is the buyer or the seller. */
  role: "buying" | "selling";
  /** The other party's name. */
  counterpart: string;
  quantity: number;
  /** Item total (price x quantity), excluding the protection fee. */
  amount: number;
  fee: number;
  slot?: string;
  status: OrderStatus;
  placedAt: number;
  timeline: { status: OrderStatus; at: number }[];
  dispute?: Dispute;
  reviewed?: boolean;
};

export type PayoutState = "held" | "released" | "refunded" | "frozen";

export type Offer = { amount: number; status: "pending" | "accepted" | "declined"; at: number };

export type Message = { id: string; from: "me" | "them"; text: string; at: number };

export type Conversation = {
  id: string;
  listingId: string;
  sellerId: string;
  sellerName: string;
  messages: Message[];
  unread: number;
};

export type NotificationKind = "offer" | "order" | "message" | "payout" | "alert" | "review" | "dispute";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  at: number;
  read: boolean;
};

export type Review = {
  id: string;
  sellerId: string;
  orderId: string;
  author: string;
  rating: number;
  tags: string[];
  text: string;
  at: number;
};

export type SavedSearch = {
  id: string;
  label: string;
  /** Browse query string, e.g. "q=casio&max=150". */
  query: string;
  createdAt: number;
  /** Listing ids that matched when saved or last viewed, to count new matches. */
  seenIds: string[];
  alerts: boolean;
};

export type ListingOverride = { stock?: number; status?: ListingStatus };

export type State = {
  user: User | null;
  saved: string[];
  recentSearches: string[];
  recentlyViewed: string[];
  offers: Record<string, Offer>;
  customCategories: CategoryDef[];
  /** Listings the user created, in any status. */
  myListings: Listing[];
  /** Changes to platform listings caused by the user's actions, e.g. stock after an order. */
  overrides: Record<string, ListingOverride>;
  orders: Order[];
  conversations: Conversation[];
  notifications: AppNotification[];
  reviews: Review[];
  savedSearches: SavedSearch[];
};
