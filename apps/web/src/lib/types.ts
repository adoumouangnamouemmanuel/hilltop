import type { PaymentKind } from "@hilltop/shared/payments";
import type { Listing, ListingStatus } from "./data";

/*
 * Domain types for everything the user does. These mirror what the backend
 * will return, so the UI won't change when the mock store is replaced.
 */

export type User = {
  name: string;
  email: string;
  /** The student's profile in the database, and its public handle (their seller URL). */
  profileId?: string;
  handle?: string;
};

/**
 * paid      money is held, seller hasn't prepared the item yet
 * ready     seller marked it ready for pickup
 * collected buyer confirmed, payout released to the seller
 * disputed  buyer reported a problem, payout frozen
 * refunded  dispute upheld, buyer refunded
 */
export type OrderStatus = "paid" | "ready" | "collected" | "disputed" | "refunded" | "cancelled";

/** A dispute reason id; the list of reasons comes from the platform config. */
export type DisputeReason = string;

export type Dispute = {
  reason: DisputeReason;
  details: string;
  openedAt: number;
  state: "open" | "withdrawn" | "refunded";
};

export type { PaymentKind };

export type OrderPayment = {
  kind: PaymentKind;
  /** Charged in the app, fee included. Held until collection (or auto-release). */
  paidInApp: number;
  /** Paid by the buyer straight to the seller at the meet-up. */
  dueAtPickup: number;
};

export type Order = {
  id: string;
  listingId: string;
  /** Snapshots from when it was ordered, for when the listing has changed or gone. */
  title?: string;
  pickup?: string;
  sellerHandle?: string;
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
  /** How the buyer pays. Orders from before payment options existed were fully protected. */
  payment?: OrderPayment;
  /** When the seller handed the item over. Starts the auto-release clock for held money. */
  handedOverAt?: number;
  /** Released by the timer rather than the buyer. */
  autoReleased?: boolean;
};

/** "direct" means the buyer pays the seller at pickup, so nothing passes through Hilltop. */
export type PayoutState = "held" | "released" | "refunded" | "frozen" | "direct";

export type Offer = { amount: number; status: "pending" | "accepted" | "declined"; at: number };

/** An offer someone made on one of your listings. */
export type IncomingOffer = {
  id: string;
  listingId: string;
  buyerName: string;
  amount: number;
  status: "pending" | "accepted" | "declined" | "withdrawn";
  at: number;
};

export type Message = { id: string; from: "me" | "them"; text: string; at: number; read?: boolean };

export type Conversation = {
  id: string;
  listingId: string;
  /** The other person in the conversation (the seller, or the buyer when you're selling). */
  sellerId: string;
  sellerName: string;
  role?: "buying" | "selling";
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

/** A listing the user reported to the moderation team. */
export type ListingReport = { listingId: string; reason: string; details: string; at: number };

export type ListingOverride = { stock?: number; status?: ListingStatus };

export type State = {
  user: User | null;
  saved: string[];
  recentSearches: string[];
  recentlyViewed: string[];
  offers: Record<string, Offer>;
  /** Offers on your listings, newest first. Older saved state may not have it. */
  incomingOffers?: IncomingOffer[];
  /** Listings the user created, in any status. */
  myListings: Listing[];
  /** Changes to platform listings caused by the user's actions, e.g. stock after an order. */
  overrides: Record<string, ListingOverride>;
  orders: Order[];
  conversations: Conversation[];
  notifications: AppNotification[];
  reviews: Review[];
  savedSearches: SavedSearch[];
  /** Listings this user reported. Older saved state may not have it. */
  reports?: ListingReport[];
};
