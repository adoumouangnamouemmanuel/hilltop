"use client";

import { z } from "zod";
import { accountPage, cursorPager } from "./pagination";
import { problem } from "./mine";
import { supabase } from "./supabase";
import type { AppNotification, ChatItem, Conversation, IncomingOffer, NotificationKind, Offer } from "./types";

/*
 * Conversations, offers and notifications for the signed-in student. Writes go
 * straight to the database; the database notifies the other person.
 */

export type Social = {
  conversations: Conversation[];
  offers: Record<string, Offer>;
  incomingOffers: IncomingOffer[];
  notifications: AppNotification[];
  unreadMessages?: number;
  moreConversations?: boolean;
  moreNotifications?: boolean;
  moreIncoming?: boolean;
};

type Person = { handle: string; name: string } | null;

const drafts = new Map<string, string>();
export const readMessageDraft = (profileId: string | undefined, conversationId: string) =>
  drafts.get(`${profileId}:${conversationId}`) ?? "";
export function saveMessageDraft(profileId: string | undefined, conversationId: string, text: string) {
  const key = `${profileId}:${conversationId}`;
  if (text) drafts.set(key, text);
  else drafts.delete(key);
  const oldest = drafts.keys().next().value;
  if (drafts.size > 50 && oldest !== undefined) drafts.delete(oldest);
}
const cardSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    price: z.number(),
    status: z.string(),
    seller: z.string().nullable(),
    image: z.string().nullable(),
  })
  .nullable()
  .optional();
const messageSchema = z.object({
  id: z.string(),
  sender_id: z.string().nullable(),
  body: z.string(),
  created_at: z.string(),
  read_at: z.string().nullable(),
  edited_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  listing_id: z.string().nullable().optional(),
  listing: cardSchema,
});

const toItem = (card: z.infer<typeof cardSchema>): ChatItem | undefined =>
  card
    ? {
        id: card.id,
        title: card.title,
        price: card.price,
        image: card.image ?? undefined,
        sellerHandle: card.seller ?? undefined,
        sold: card.status === "sold",
      }
    : undefined;
const personSchema = z.object({ handle: z.string(), name: z.string() }).nullable();
const conversationSchema = z.object({
  id: z.string(),
  listing_id: z.string().nullable(),
  buyer_id: z.string().nullable(),
  last_message_at: z.string(),
  buyer: personSchema,
  seller: personSchema,
  listing: cardSchema,
  messages: z.array(messageSchema),
});
const notificationSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  href: z.string(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});
const offerSchema = z.object({
  id: z.string(),
  listing_id: z.string(),
  amount: z.number(),
  status: z.enum(["pending", "accepted", "declined", "withdrawn"]),
  created_at: z.string(),
  buyer: z.object({ name: z.string() }).nullable().optional(),
  listing: z.object({ title: z.string() }).nullable().optional(),
});
const conversationsPager = cursorPager((cursor) => accountPage("conversations", conversationSchema, cursor, 30));
const notificationsPager = cursorPager((cursor) => accountPage("notifications", notificationSchema, cursor, 50));
const offersPager = cursorPager((cursor) => accountPage("offers", offerSchema, cursor, 100));
const incomingPager = cursorPager((cursor) => accountPage("incoming", offerSchema, cursor, 50));
let activeThread: string | null = null;
const messagesPager = cursorPager((cursor) => accountPage("messages", messageSchema, cursor, 100, activeThread ?? undefined));
const ownOffers = new Map<string, Offer>();
const visitedOffers = new Set<string>();
let generation = 0;
export function closeMessageHistory() {
  activeThread = null;
  messagesPager.reset();
}
export function resetSocialLimits() {
  generation++;
  drafts.clear();
  ownOffers.clear();
  visitedOffers.clear();
  closeMessageHistory();
  for (const pager of [conversationsPager, notificationsPager, offersPager, incomingPager]) pager.reset();
}
export async function expandSocialHistory(
  kind: "conversations" | "notifications" | "incoming" | "messages",
  profileId: string,
  conversationId?: string,
) {
  if (kind === "messages") {
    if (!conversationId) return;
    if (activeThread !== conversationId) {
      messagesPager.reset();
      activeThread = conversationId;
      await messagesPager.read(profileId);
    } else await messagesPager.read(profileId, true);
  } else {
    const pager = kind === "conversations" ? conversationsPager : kind === "notifications" ? notificationsPager : incomingPager;
    await pager.read(profileId, true);
  }
}

export async function loadSocial(profileId: string): Promise<Social | null> {
  const client = supabase();
  const ticket = generation;
  if (!client) return null;
  const [convos, mine, incoming, notes, counts] = await Promise.all([
    conversationsPager.read(profileId),
    offersPager.read(profileId),
    incomingPager.read(profileId),
    notificationsPager.read(profileId),
    client.rpc("message_unread_counts"),
  ]);
  if (counts.error || ticket !== generation) return null;
  if (visitedOffers.size) {
    const latest = await client.rpc("latest_offers", { p_listings: [...visitedOffers] });
    if (latest.error || ticket !== generation) return null;
    const rows = z.array(offerSchema).parse(latest.data);
    ownOffers.clear();
    for (const row of rows)
      if (row.status !== "withdrawn")
        ownOffers.set(row.listing_id, { amount: row.amount, status: row.status, at: Date.parse(row.created_at) });
  }
  const history = activeThread ? await messagesPager.read(profileId) : null;
  const unreadCounts = counts.data && typeof counts.data === "object" && !Array.isArray(counts.data) ? counts.data : {};
  const unreadFor = (id: string) => (typeof unreadCounts[id] === "number" ? unreadCounts[id] : 0);

  const conversations: Conversation[] = convos.items.flatMap((c) => {
    const iAmBuyer = c.buyer_id === profileId;
    // One thread per pair: the other person is whoever isn't me.
    const other = (iAmBuyer ? c.seller : c.buyer) as Person;
    const mine = (iAmBuyer ? c.buyer : c.seller) as Person;
    const item = toItem(c.listing);
    return [
      {
        id: c.id,
        listingId: c.listing_id ?? "",
        item,
        sellerId: other?.handle ?? "",
        sellerName: other?.name ?? "A student",
        // Whether the item being discussed now is mine to sell.
        role: item?.sellerHandle && item.sellerHandle === mine?.handle ? "selling" : "buying",
        messages: [...(activeThread === c.id && history ? history.items : c.messages.slice(0, 30))].reverse().map((m) => ({
          id: m.id,
          from: m.sender_id === profileId ? "me" : "them",
          text: m.body,
          at: Date.parse(m.created_at),
          read: !!m.read_at,
          edited: !!m.edited_at,
          deleted: !!m.deleted_at,
          listingId: m.listing_id ?? undefined,
          item: toItem(m.listing),
        })),
        hasMoreMessages: activeThread === c.id && history ? !!history.next : c.messages.length > 30,
        unread: unreadFor(c.id),
      } satisfies Conversation,
    ];
  });

  const offers: Record<string, Offer> = {};
  const handled = new Set<string>();
  for (const o of mine.items) {
    if (handled.has(o.listing_id)) continue;
    handled.add(o.listing_id);
    if (o.status !== "withdrawn") offers[o.listing_id] = { amount: o.amount, status: o.status, at: Date.parse(o.created_at) };
  }
  for (const [id, offer] of ownOffers) offers[id] = offer;

  return {
    unreadMessages: Object.keys(unreadCounts).reduce((sum, id) => sum + unreadFor(id), 0),
    moreConversations: !!convos.next,
    moreNotifications: !!notes.next,
    moreIncoming: !!incoming.next,
    conversations,
    offers,
    incomingOffers: incoming.items.map((o) => ({
      id: o.id,
      listingId: o.listing_id,
      buyerName: o.buyer?.name ?? "A student",
      amount: Number(o.amount),
      status: o.status,
      at: Date.parse(o.created_at),
    })),
    notifications: notes.items.map((n) => ({
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

/**
 * Sends a message. Two students share one thread, so a message from a listing page
 * continues their chat (starting it if needed) and names the item (`about`), which the
 * thread shows as a card. Replies in the inbox name no item. Returns the thread's id.
 */
export async function sendMessageRemote(
  profileId: string,
  about: { listingId: string } | null,
  conversationId: string | undefined,
  text: string,
  messageId = crypto.randomUUID(),
): Promise<{ conversationId: string } | { error: string }> {
  const client = supabase();
  if (!client) return { error: "Messaging isn't available right now." };
  let id = conversationId;
  if (!id) {
    if (!about) return { error: "Couldn't find this conversation. Reload and try again." };
    const started = await client.rpc("start_conversation", { p_listing: about.listingId });
    if (started.error || !started.data) return { error: problem(started.error, "Couldn't start the conversation.")! };
    id = started.data;
  }
  const sent = await client
    .from("messages")
    .insert({ id: messageId, conversation_id: id, sender_id: profileId, body: text, listing_id: about?.listingId ?? null });
  if (sent.error) {
    if (sent.error.code === "23505") {
      const previous = await client
        .from("messages")
        .select("id")
        .eq("id", messageId)
        .eq("sender_id", profileId)
        .eq("conversation_id", id)
        .eq("body", text)
        .maybeSingle();
      if (previous.data) return { conversationId: id };
    }
    return { error: problem(sent.error, "Your message didn't send. Try again.")! };
  }
  return { conversationId: id };
}

/** Messages can be edited for this long after sending; the database enforces it too. */
export const EDIT_WINDOW_MS = 15 * 60_000;

export async function editMessageRemote(messageId: string, body: string) {
  const { error } = (await supabase()?.from("messages").update({ body }).eq("id", messageId)) ?? {
    error: { message: "Not connected", code: "OFFLINE" },
  };
  return problem(error, "Couldn't edit the message. Try again.");
}

/** Deletes a message for everyone. The team keeps what it said, for disputes. */
export async function deleteMessageRemote(messageId: string) {
  const { error } = (await supabase()?.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", messageId)) ?? {
    error: { message: "Not connected", code: "OFFLINE" },
  };
  return problem(error, "Couldn't delete the message. Try again.");
}

/**
 * "Typing…" between the two people in a conversation, over Realtime broadcast:
 * nothing is stored. The channel is private: the database only lets the two people
 * in the conversation join it. `onTyping` fires when the other person types.
 */
export function joinTyping(conversationId: string, profileId: string, onTyping: () => void) {
  const client = supabase();
  if (!client) return { typing: () => {}, leave: () => {} };
  const channel = client.channel(`typing:${conversationId}`, { config: { broadcast: { self: false }, private: true } });
  channel.on("broadcast", { event: "typing" }, ({ payload }) => payload?.from !== profileId && onTyping()).subscribe();
  let last = 0;
  return {
    typing: () => {
      // At most every couple of seconds.
      if (Date.now() - last < 2500) return;
      last = Date.now();
      void channel.send({ type: "broadcast", event: "typing", payload: { from: profileId } });
    },
    leave: () => void client.removeChannel(channel),
  };
}

export async function readConversationRemote(profileId: string, conversationId: string) {
  const client = supabase();
  if (!client) return;
  const now = new Date().toISOString();
  const results = await Promise.all([
    client.from("messages").update({ read_at: now }).eq("conversation_id", conversationId).neq("sender_id", profileId).is("read_at", null),
    client.from("notifications").update({ read_at: now }).eq("href", `/inbox?c=${conversationId}`).is("read_at", null),
  ]);
  return results.some((result) => result.error) ? "Could not sync read receipts. Try again." : null;
}

// Offers -------------------------------------------------------------------------------------

export async function makeOfferRemote(profileId: string, listingId: string, amount: number) {
  const { error } = (await supabase()?.from("offers").insert({ listing_id: listingId, buyer_id: profileId, amount })) ?? {
    error: { message: "Not connected", code: "OFFLINE" },
  };
  return problem(error, "Your offer didn't send. Try again.");
}

export async function answerOfferRemote(offerId: string, accepted: boolean) {
  const { error } = (await supabase()?.rpc("answer_offer", { p_offer: offerId, p_status: accepted ? "accepted" : "declined" })) ?? {
    error: { message: "Not connected", code: "OFFLINE" },
  };
  return problem(error, "Couldn't answer the offer. Try again.");
}

// Notifications ----------------------------------------------------------------------------------

export async function markReadRemote(id?: string) {
  const query = supabase()?.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  const result = await (id ? query?.eq("id", id) : query);
  return !result || result.error ? "Could not sync notification read status. Try again." : null;
}

/**
 * Calls `onChange` when something arrives for this student, live where Realtime runs.
 * `onLive` says whether the live connection is up, so polling can back off.
 */
export function watchSocial(profileId: string, onChange: () => void, onLive: (live: boolean) => void) {
  const client = supabase();
  if (!client) return () => {};
  const channel = client
    .channel(`social-${profileId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `profile_id=eq.${profileId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "offers" }, onChange)
    .subscribe((status) => onLive(status === "SUBSCRIBED"));
  return () => {
    client.removeChannel(channel);
  };
}

/** A detail page reads its own offer even when it is older than the initial history page. */
export async function loadListingOffer(profileId: string, listingId: string) {
  const client = supabase();
  if (!client) return undefined;
  const ticket = generation;
  const { data, error } = await client.rpc("latest_offers", { p_listings: [listingId] });
  if (error) throw new Error("Could not load your offer. Retry before ordering.");
  if (ticket !== generation) return undefined;
  visitedOffers.add(listingId);
  const oldest = visitedOffers.values().next().value;
  if (visitedOffers.size > 50 && oldest !== undefined) visitedOffers.delete(oldest);
  const row = z.array(offerSchema).parse(data)[0];
  const offer: Offer | undefined =
    row && row.status !== "withdrawn" ? { amount: row.amount, status: row.status, at: Date.parse(row.created_at) } : undefined;
  if (offer) ownOffers.set(listingId, offer);
  else ownOffers.delete(listingId);
  return offer;
}
