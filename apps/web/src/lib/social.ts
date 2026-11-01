"use client";

import { problem } from "./mine";
import { supabase } from "./supabase";
import type { AppNotification, Conversation, IncomingOffer, NotificationKind, Offer } from "./types";

/*
 * Conversations, offers and notifications for the signed-in student. Writes go
 * straight to the database; the database notifies the other person.
 */

export type Social = {
  conversations: Conversation[];
  offers: Record<string, Offer>;
  incomingOffers: IncomingOffer[];
  notifications: AppNotification[];
};

type Person = { handle: string; name: string } | null;

export async function loadSocial(profileId: string): Promise<Social | null> {
  const client = supabase();
  if (!client) return null;
  const [convos, mine, incoming, notes] = await Promise.all([
    client
      .from("conversations")
      .select(
        "id, listing_id, buyer_id, buyer:profiles!conversations_buyer_id_fkey(handle, name), seller:profiles!conversations_seller_id_fkey(handle, name), messages(id, sender_id, body, created_at, read_at)",
      )
      .order("last_message_at", { ascending: false })
      .order("created_at", { referencedTable: "messages", ascending: true })
      .limit(100),
    client.from("offers").select("listing_id, amount, status, created_at").eq("buyer_id", profileId).order("created_at"),
    client
      .from("offers")
      .select(
        "id, listing_id, amount, status, created_at, buyer:profiles!offers_buyer_id_fkey(name), listing:listings!inner(seller_id, title)",
      )
      .eq("listing.seller_id", profileId)
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("notifications")
      .select("id, kind, title, body, href, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (convos.error || mine.error || incoming.error || notes.error) return null;

  const conversations: Conversation[] = convos.data.flatMap((c) => {
    const iAmBuyer = c.buyer_id === profileId;
    // The other person: the seller when buying, the buyer when selling.
    const other = (iAmBuyer ? c.seller : c.buyer) as Person;
    if (!c.listing_id) return [];
    return [
      {
        id: c.id,
        listingId: c.listing_id,
        sellerId: other?.handle ?? "",
        sellerName: other?.name ?? "A student",
        role: iAmBuyer ? "buying" : "selling",
        messages: c.messages.map((m) => ({
          id: m.id,
          from: m.sender_id === profileId ? "me" : "them",
          text: m.body,
          at: Date.parse(m.created_at),
          read: !!m.read_at,
        })),
        unread: c.messages.filter((m) => m.sender_id !== profileId && !m.read_at).length,
      } satisfies Conversation,
    ];
  });

  // The latest offer per listing is the one that counts.
  const offers: Record<string, Offer> = {};
  for (const o of mine.data) {
    if (o.status === "withdrawn") continue;
    offers[o.listing_id] = { amount: Number(o.amount), status: o.status, at: Date.parse(o.created_at) };
  }

  return {
    conversations,
    offers,
    incomingOffers: incoming.data.map((o) => ({
      id: o.id,
      listingId: o.listing_id,
      buyerName: (o.buyer as { name: string } | null)?.name ?? "A student",
      amount: Number(o.amount),
      status: o.status,
      at: Date.parse(o.created_at),
    })),
    notifications: notes.data.map((n) => ({
      id: n.id,
      kind: (n.kind === "system" ? "alert" : n.kind) as NotificationKind,
      title: n.title,
      body: n.body,
      href: n.href,
      at: Date.parse(n.created_at),
      read: !!n.read_at,
    })),
  };
}

// Messages -----------------------------------------------------------------------------

/** Sends a message about a listing, starting the conversation if needed. Returns its id. */
export async function sendMessageRemote(
  profileId: string,
  listing: { id: string; sellerProfileId: string },
  conversationId: string | undefined,
  text: string,
): Promise<{ conversationId: string } | { error: string }> {
  const client = supabase();
  if (!client) return { error: "Messaging isn't available right now." };
  let id = conversationId;
  if (!id) {
    const existing = await client.from("conversations").select("id").eq("listing_id", listing.id).eq("buyer_id", profileId).maybeSingle();
    id = existing.data?.id;
  }
  if (!id) {
    const created = await client
      .from("conversations")
      .insert({ listing_id: listing.id, buyer_id: profileId, seller_id: listing.sellerProfileId })
      .select("id")
      .single();
    if (created.error) return { error: problem(created.error, "Couldn't start the conversation.")! };
    id = created.data.id;
  }
  const sent = await client.from("messages").insert({ conversation_id: id, sender_id: profileId, body: text });
  if (sent.error) return { error: problem(sent.error, "Your message didn't send. Try again.")! };
  return { conversationId: id };
}

export async function readConversationRemote(profileId: string, conversationId: string) {
  const client = supabase();
  if (!client) return;
  const now = new Date().toISOString();
  await Promise.all([
    client.from("messages").update({ read_at: now }).eq("conversation_id", conversationId).neq("sender_id", profileId).is("read_at", null),
    client.from("notifications").update({ read_at: now }).eq("href", `/inbox?c=${conversationId}`).is("read_at", null),
  ]);
}

// Offers -------------------------------------------------------------------------------------

export async function makeOfferRemote(profileId: string, listingId: string, amount: number) {
  const { error } = (await supabase()?.from("offers").insert({ listing_id: listingId, buyer_id: profileId, amount })) ?? {};
  return problem(error, "Your offer didn't send. Try again.");
}

export async function answerOfferRemote(offerId: string, accepted: boolean) {
  const { error } =
    (await supabase()
      ?.from("offers")
      .update({ status: accepted ? "accepted" : "declined" })
      .eq("id", offerId)) ?? {};
  return problem(error, "Couldn't answer the offer. Try again.");
}

// Notifications ----------------------------------------------------------------------------------

export async function markReadRemote(id?: string) {
  const query = supabase()?.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  await (id ? query?.eq("id", id) : query);
}

/** Calls `onChange` when something arrives for this student, live where Realtime runs. */
export function watchSocial(profileId: string, onChange: () => void) {
  const client = supabase();
  if (!client) return () => {};
  const channel = client
    .channel(`social-${profileId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `profile_id=eq.${profileId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "offers" }, onChange)
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}
