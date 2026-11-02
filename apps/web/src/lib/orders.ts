"use client";

import { z } from "zod";
import { accountPage, cursorPager } from "./pagination";
import { problem } from "./mine";
import { supabase } from "./supabase";
import type { Order, OrderStatus, Review } from "./types";

/*
 * Orders for the signed-in student, as buyer or seller. The database prices each
 * order, takes the item off the market, and decides which status changes each side
 * may make; see the orders migration.
 */

const orderStatusSchema = z.enum(["paid", "ready", "collected", "disputed", "refunded", "cancelled"]);
const orderRowSchema = z.object({
  id: z.string(),
  listing_id: z.string().nullable(),
  listing_title: z.string(),
  pickup: z.string().nullable(),
  buyer_id: z.string().nullable(),
  seller_id: z.string().nullable(),
  buyer_name: z.string().nullable(),
  seller_name: z.string().nullable(),
  quantity: z.number(),
  amount: z.number(),
  fee: z.number(),
  payment_kind: z.enum(["protected", "deposit", "pickup"]),
  paid_in_app: z.number(),
  due_at_pickup: z.number(),
  slot: z.string().nullable(),
  status: orderStatusSchema,
  handed_over_at: z.string().nullable(),
  auto_released: z.boolean(),
  placed_at: z.string(),
  buyer: z.object({ name: z.string() }).nullable(),
  seller: z.object({ name: z.string(), handle: z.string() }).nullable(),
  order_events: z.array(z.object({ status: orderStatusSchema, at: z.string() })),
  disputes: z
    .object({
      id: z.string(),
      opened_by: z.string().nullable(),
      reason: z.string(),
      details: z.string(),
      state: z.string(),
      opened_at: z.string(),
    })
    .nullable(),
  reviews: z.array(z.object({ id: z.string() })),
});
type Row = z.infer<typeof orderRowSchema>;
const ordersPager = cursorPager((cursor) => accountPage("orders", orderRowSchema, cursor, 100));
const disputeMessageSchema = z.object({ id: z.string(), body: z.string(), role: z.string(), at: z.string() });
const casePagers = new Map<string, ReturnType<typeof makeCasePager>>();
const makeCasePager = (id: string) => cursorPager((cursor) => accountPage("dispute_messages", disputeMessageSchema, cursor, 50, id));
export function resetOrderLimit() {
  ordersPager.reset();
  for (const pager of casePagers.values()) pager.reset();
  casePagers.clear();
}
export async function expandOrderHistory(profileId: string) {
  await ordersPager.read(profileId, true);
}
export const hasMoreOrders = () => !!ordersPager.snapshot().next;

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
    // The name copied onto the order covers someone who has since deleted their account.
    counterpart: (selling ? (r.buyer?.name ?? r.buyer_name) : (r.seller?.name ?? r.seller_name)) ?? "A student",
    quantity: r.quantity,
    amount: Number(r.amount),
    fee: Number(r.fee),
    slot: r.slot ?? undefined,
    status: r.status,
    placedAt: Date.parse(r.placed_at),
    timeline: [...r.order_events].sort((a, b) => a.at.localeCompare(b.at)).map((e) => ({ status: e.status, at: Date.parse(e.at) })),
    dispute: dispute
      ? {
          id: dispute.id,
          canWithdraw: dispute.opened_by === profileId,
          reason: dispute.reason,
          details: dispute.details,
          openedAt: Date.parse(dispute.opened_at),
          state:
            dispute.state === "released"
              ? "released"
              : dispute.state === "refunded"
                ? "refunded"
                : dispute.state === "open"
                  ? "open"
                  : "withdrawn",
        }
      : undefined,
    reviewed: !!one(r.reviews),
    payment: { kind: r.payment_kind, paidInApp: Number(r.paid_in_app), dueAtPickup: Number(r.due_at_pickup) },
    handedOverAt: r.handed_over_at ? Date.parse(r.handed_over_at) : undefined,
    autoReleased: r.auto_released || undefined,
  };
}

export async function loadOrders(profileId: string): Promise<Order[] | null> {
  const page = await ordersPager.read(profileId);
  return page.items.map((row) => toOrder(row, profileId));
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
  const { error } = (await supabase()?.from("orders").update({ status }).eq("id", orderId)) ?? {
    error: { message: "Not connected", code: "OFFLINE" },
  };
  return problem(error, "Couldn't update the order. Try again.");
}

/** The seller records the meet-up; the buyer confirms collection after. */
export async function markHandedOverRemote(orderId: string) {
  const { error } = (await supabase()?.rpc("mark_handed_over", { p_order: orderId })) ?? {
    error: { message: "Not connected", code: "OFFLINE" },
  };
  return problem(error, "Couldn't record the handover. Try again.");
}

/** Reports a problem: the order is held until the reporter withdraws it or the team settles it. */
export async function openDisputeRemote(orderId: string, reason: string, details: string) {
  const { error } = (await supabase()?.rpc("open_dispute", { p_order: orderId, p_reason: reason, p_details: details })) ?? {
    error: { message: "Not connected", code: "OFFLINE" },
  };
  return problem(error, "Couldn't report the problem. Try again, or contact support.");
}

export async function withdrawDisputeRemote(orderId: string) {
  const { error } = (await supabase()?.rpc("withdraw_dispute", { p_order: orderId })) ?? {
    error: { message: "Not connected", code: "OFFLINE" },
  };
  return problem(error, "Couldn't withdraw the report. Try again.");
}

export async function addReviewRemote(profileId: string, sellerProfileId: string, r: Pick<Review, "orderId" | "rating" | "tags" | "text">) {
  const { error } = (await supabase()
    ?.from("reviews")
    .insert({ order_id: r.orderId, seller_id: sellerProfileId, author_id: profileId, rating: r.rating, tags: r.tags, body: r.text })) ?? {
    error: { message: "Not connected", code: "OFFLINE" },
  };
  return error && error.code !== "23505" ? problem(error, "Couldn't post your review. Try again.") : null;
}

/** The seller's profile id for an order, for reviews. */
export async function sellerOf(orderId: string) {
  const { data } = (await supabase()?.from("orders").select("seller_id").eq("id", orderId).maybeSingle()) ?? {
    error: { message: "Not connected", code: "OFFLINE" },
  };
  return data?.seller_id ?? null;
}

export type DisputeMessage = { id: string; body: string; role: string; at: string };
export const hasMoreDisputeMessages = (id: string) => !!casePagers.get(id)?.snapshot().next;
export async function loadDisputeMessages(disputeId: string, more = false): Promise<DisputeMessage[]> {
  let pager = casePagers.get(disputeId);
  if (!pager) {
    pager = makeCasePager(disputeId);
    casePagers.set(disputeId, pager);
  }
  const page = await pager.read(disputeId, more);
  return [...page.items].reverse();
}
export async function replyToDispute(disputeId: string, body: string) {
  const client = supabase();
  if (!client) return "Connect before sending a reply.";
  const { error } = await client.rpc("add_dispute_message", { p_dispute: disputeId, p_body: body });
  return problem(error, "Couldn't send your reply. Your text is kept; try again.");
}
