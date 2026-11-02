"use client";

import { problem } from "./mine";
import { supabase } from "./supabase";
import type { Order, OrderStatus, Review } from "./types";

/*
 * Orders for the signed-in student, as buyer or seller. The database prices each
 * order, takes the item off the market, and decides which status changes each side
 * may make; see the orders migration.
 */

const ORDER_COLUMNS =
  "id, listing_id, listing_title, pickup, buyer_id, seller_id, quantity, amount, fee, payment_kind, paid_in_app, due_at_pickup, slot, status, handed_over_at, auto_released, placed_at, " +
  "buyer:profiles!orders_buyer_id_fkey(name), seller:profiles!orders_seller_id_fkey(name, handle), order_events(status, at), disputes(reason, details, state, opened_at), reviews(id)";

type Row = {
  id: string;
  listing_id: string | null;
  listing_title: string;
  pickup: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  quantity: number;
  amount: number;
  fee: number;
  payment_kind: "protected" | "deposit" | "pickup";
  paid_in_app: number;
  due_at_pickup: number;
  slot: string | null;
  status: OrderStatus;
  handed_over_at: string | null;
  auto_released: boolean;
  placed_at: string;
  buyer: { name: string } | null;
  seller: { name: string; handle: string } | null;
  order_events: { status: OrderStatus; at: string }[];
  disputes:
    | { reason: string; details: string; state: string; opened_at: string }
    | { reason: string; details: string; state: string; opened_at: string }[]
    | null;
  reviews: { id: string }[] | { id: string } | null;
};

const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function toOrder(r: Row, profileId: string): Order {
  const selling = r.seller_id === profileId;
  const dispute = one(r.disputes);
  return {
    id: r.id,
    listingId: r.listing_id ?? "",
    title: r.listing_title,
    pickup: r.pickup ?? undefined,
    sellerHandle: r.seller?.handle,
    role: selling ? "selling" : "buying",
    counterpart: (selling ? r.buyer?.name : r.seller?.name) ?? "Deleted student",
    quantity: r.quantity,
    amount: Number(r.amount),
    fee: Number(r.fee),
    slot: r.slot ?? undefined,
    status: r.status,
    placedAt: Date.parse(r.placed_at),
    timeline: [...r.order_events].sort((a, b) => a.at.localeCompare(b.at)).map((e) => ({ status: e.status, at: Date.parse(e.at) })),
    dispute: dispute
      ? {
          reason: dispute.reason,
          details: dispute.details,
          openedAt: Date.parse(dispute.opened_at),
          state: dispute.state === "refunded" ? "refunded" : dispute.state === "open" ? "open" : "withdrawn",
        }
      : undefined,
    reviewed: !!one(r.reviews),
    payment: { kind: r.payment_kind, paidInApp: Number(r.paid_in_app), dueAtPickup: Number(r.due_at_pickup) },
    handedOverAt: r.handed_over_at ? Date.parse(r.handed_over_at) : undefined,
    autoReleased: r.auto_released || undefined,
  };
}

export async function loadOrders(profileId: string): Promise<Order[] | null> {
  const client = supabase();
  if (!client) return null;
  const { data, error } = await client
    .from("orders")
    .select(ORDER_COLUMNS)
    .or(`buyer_id.eq.${profileId},seller_id.eq.${profileId}`)
    .order("placed_at", { ascending: false })
    .limit(200);
  if (error) return null;
  return (data as unknown as Row[]).map((r) => toOrder(r, profileId));
}

/** Reserves a listing. The database sets the price (an accepted offer counts) and takes it off the market. */
export async function placeOrderRemote(input: {
  listingId: string;
  quantity: number;
  slot?: string;
}): Promise<{ id: string } | { error: string }> {
  const client = supabase();
  if (!client) return { error: "Ordering isn't available right now." };
  const { data, error } = await client
    .from("orders")
    // The database fills in the buyer, seller, title and prices (prepare_order), so they aren't sent.
    .insert({ listing_id: input.listingId, quantity: input.quantity, slot: input.slot ?? null, payment_kind: "pickup" } as never)
    .select("id")
    .single();
  if (error || !data) return { error: problem(error, "Couldn't place your order. Try again.")! };
  return { id: data.id };
}

export async function setOrderStatusRemote(orderId: string, status: OrderStatus) {
  const { error } = (await supabase()?.from("orders").update({ status }).eq("id", orderId)) ?? {};
  return problem(error, "Couldn't update the order. Try again.");
}

export async function addReviewRemote(profileId: string, sellerProfileId: string, r: Pick<Review, "orderId" | "rating" | "tags" | "text">) {
  const { error } =
    (await supabase()
      ?.from("reviews")
      .insert({ order_id: r.orderId, seller_id: sellerProfileId, author_id: profileId, rating: r.rating, tags: r.tags, body: r.text })) ??
    {};
  return error && error.code !== "23505" ? problem(error, "Couldn't post your review. Try again.") : null;
}

/** The seller's profile id for an order, for reviews. */
export async function sellerOf(orderId: string) {
  const { data } = (await supabase()?.from("orders").select("seller_id").eq("id", orderId).maybeSingle()) ?? {};
  return data?.seller_id ?? null;
}
