"use client";

import { supabase } from "./supabase";
import type { AdminDispute, AdminOrder, AdminState, AdminUser, ListingState, ModListing } from "./types";

/*
 * The marketplace's operational data from Supabase: students, listings with their
 * open reports, orders and disputes. Row-level security returns only what the
 * signed-in admin's role may see, so a role without users.view gets no users.
 */

export type Operations = Pick<AdminState, "users" | "listings" | "orders" | "disputes">;

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : 0);

const listingState = (status: string): ListingState =>
  status === "active" ? "live" : status === "sold" ? "sold" : status === "removed" ? "removed" : "hidden";

/** The database status for a moderation state. */
export const dbListingStatus = (state: ListingState) =>
  (({ live: "active", sold: "sold", hidden: "hidden", removed: "removed" }) as const)[state];

export async function loadOperations(): Promise<Operations | null> {
  const client = supabase();
  if (!client) return null;
  const [profiles, emails, ratings, listings, reports, orders, disputes] = await Promise.all([
    client.from("profiles").select("id, name, specialty, class_of, major, status, verified, created_at, sales"),
    client.from("profile_emails").select("profile_id, email"),
    client.from("seller_ratings").select("seller_id, rating, reviews"),
    client
      .from("listings")
      .select(
        "id, title, description, condition, pickup, stock, price, category, seller_id, status, promoted_until, views, saves, posted_at, listing_photos(url, position)",
      )
      .order("posted_at", { ascending: false })
      .limit(2000),
    client
      .from("reports")
      .select("id, listing_id, reason, created_at, status, reporter:profiles!reports_reporter_id_fkey(name)")
      .eq("status", "open"),
    client
      .from("orders")
      .select(
        "id, listing_id, listing_title, buyer_id, seller_id, buyer_name, seller_name, quantity, slot, amount, fee, payment_kind, paid_in_app, pickup, status, placed_at, handed_over_at, listing:listings(category), order_events(status, at)",
      )
      // The queues work on recent orders; older ones are in the nightly backup and the database.
      .order("placed_at", { ascending: false })
      .limit(500),
    client
      .from("disputes")
      .select("id, order_id, reason, details, state, opened_at, resolved_at, resolution_note, dispute_messages(role, body, at)")
      .order("opened_at", { ascending: false })
      .limit(300),
  ]);
  const failed = [profiles, emails, ratings, listings, reports, orders, disputes].find((r) => r.error);
  if (failed) {
    console.error("Couldn't load marketplace data", failed.error);
    return null;
  }

  const names = new Map(profiles.data!.map((p) => [p.id, p.name]));
  const emailOf = new Map(emails.data!.map((e) => [e.profile_id, e.email]));
  const ratingOf = new Map(ratings.data!.map((r) => [r.seller_id, Number(r.rating)]));
  const reportsFor = new Map<string, ModListing["reports"]>();
  for (const r of reports.data!) {
    const list = reportsFor.get(r.listing_id) ?? [];
    list.push({ id: r.id, reason: r.reason, by: (r.reporter as { name: string } | null)?.name ?? "A student", at: ms(r.created_at) });
    reportsFor.set(r.listing_id, list);
  }

  const now = Date.now();
  const modListings: ModListing[] = listings.data!.map((l) => {
    const images = [...(l.listing_photos ?? [])].sort((a, b) => a.position - b.position).map((p) => p.url);
    return {
      id: l.id,
      title: l.title,
      price: Number(l.price),
      category: l.category,
      image: images[0] ?? "",
      images,
      description: l.description,
      condition: l.condition ?? undefined,
      pickup: l.pickup,
      stock: l.stock ?? undefined,
      sellerId: l.seller_id,
      sellerName: names.get(l.seller_id) ?? "A student",
      state: listingState(l.status),
      promoted: !!l.promoted_until && Date.parse(l.promoted_until) > now,
      views: l.views,
      saves: l.saves,
      postedAt: ms(l.posted_at),
      reports: reportsFor.get(l.id) ?? [],
    };
  });

  const adminOrders: AdminOrder[] = orders.data!.map((o) => ({
    id: o.id,
    listingId: o.listing_id ?? "",
    title: o.listing_title,
    category: (o.listing as { category: string } | null)?.category ?? "other",
    // Names copied onto the order keep the record readable after an account is deleted.
    buyer: (o.buyer_id && names.get(o.buyer_id)) || (o.buyer_name ? `${o.buyer_name} (deleted)` : "Deleted student"),
    seller: (o.seller_id && names.get(o.seller_id)) || (o.seller_name ? `${o.seller_name} (deleted)` : "Deleted student"),
    amount: Number(o.amount),
    fee: Number(o.fee),
    method: o.payment_kind === "pickup" ? "Paid at pickup" : "In the app",
    pickup: o.pickup ?? "",
    status: o.status,
    placedAt: ms(o.placed_at),
    payment: o.payment_kind,
    paidInApp: Number(o.paid_in_app),
    handedOverAt: o.handed_over_at ? ms(o.handed_over_at) : undefined,
    buyerId: o.buyer_id ?? undefined,
    sellerId: o.seller_id ?? undefined,
    quantity: o.quantity,
    slot: o.slot ?? undefined,
    timeline: [...(o.order_events ?? [])].sort((a, b) => a.at.localeCompare(b.at)).map((e) => ({ status: e.status, at: ms(e.at) })),
  }));

  const users: AdminUser[] = profiles.data!.map((p) => {
    const own = modListings.filter((l) => l.sellerId === p.id);
    return {
      id: p.id,
      name: p.name,
      email: emailOf.get(p.id) ?? "",
      specialty: p.specialty ?? undefined,
      classOf: p.class_of ?? undefined,
      major: p.major ?? undefined,
      status: p.status,
      verified: p.verified,
      joinedAt: ms(p.created_at),
      listings: own.filter((l) => l.state === "live").length,
      sales: p.sales,
      purchases: orders.data!.filter((o) => o.buyer_id === p.id && o.status === "collected").length,
      rating: ratingOf.get(p.id) ?? null,
      reports: own.reduce((n, l) => n + l.reports.length, 0),
    };
  });

  const adminDisputes: AdminDispute[] = disputes.data!.map((d) => ({
    id: d.id,
    orderId: d.order_id,
    reason: d.reason,
    details: d.details,
    openedAt: ms(d.opened_at),
    // A withdrawn report lets the payment go ahead, like a released one.
    state: d.state === "withdrawn" ? "released" : d.state,
    messages: (d.dispute_messages ?? []).map((m) => ({
      from: m.role as "buyer" | "seller" | "admin",
      name: m.role,
      text: m.body,
      at: ms(m.at),
    })),
    resolution: d.resolved_at ? { by: "Hilltop", at: ms(d.resolved_at), note: d.resolution_note ?? "" } : undefined,
  }));

  return { users, listings: modListings, orders: adminOrders, disputes: adminDisputes };
}

/** Writes moderation changes made in the portal: verification, suspension, listing states and reports. */
export async function saveOperations(before: Operations, after: Operations) {
  const client = supabase();
  if (!client) return "Not connected.";
  const errors: string[] = [];
  // Deleting an account needs the server's secret key, so it goes through the portal's API.
  const gone = before.users.filter((u) => !after.users.some((x) => x.id === u.id));
  if (gone.length) {
    const token = (await client.auth.getSession()).data.session?.access_token;
    for (const u of gone) {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't delete the account.";
    }
  }
  const was = new Map(before.users.map((u) => [u.id, u]));
  for (const u of after.users) {
    const old = was.get(u.id);
    if (!old || (old.verified === u.verified && old.status === u.status)) continue;
    const { error } = await client.from("profiles").update({ verified: u.verified, status: u.status }).eq("id", u.id);
    if (error) errors.push("Couldn't save that change. Try again.");
  }
  const wasListing = new Map(before.listings.map((l) => [l.id, l]));
  for (const l of after.listings) {
    const old = wasListing.get(l.id);
    if (!old) continue;
    if (old.state !== l.state) {
      const { error } = await client
        .from("listings")
        .update({ status: dbListingStatus(l.state) })
        .eq("id", l.id);
      if (error) errors.push("Couldn't save that change. Try again.");
    }
    // Reports the portal cleared were acted on (with the listing) or dismissed.
    const cleared = old.reports.filter((r) => !l.reports.some((x) => x.id === r.id)).map((r) => r.id);
    if (cleared.length) {
      const { error } = await client
        .from("reports")
        .update({ status: old.state !== l.state ? "actioned" : "dismissed", handled_at: new Date().toISOString() })
        .in("id", cleared);
      if (error) errors.push("Couldn't save that change. Try again.");
    }
  }
  return errors.length ? errors[0] : null;
}
