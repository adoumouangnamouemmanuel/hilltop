"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowUp, Check, CheckCheck, ExternalLink, MessageCircle, Pencil, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { useConfig } from "@/lib/config";
import { formatCedi } from "@/lib/format";
import { useBodyScrollLock, useMediaQuery, useNow } from "@/lib/hooks";
import { findListing, useStore } from "@/lib/store";
import { EDIT_WINDOW_MS, joinTyping } from "@/lib/social";
import type { Conversation, Message } from "@/lib/types";
import { RelativeTime } from "@/components/controls";
import { Avatar, buttonClass, cn } from "@/components/ui";

export function InboxView() {
  const router = useRouter();
  const pathname = usePathname();
  const selectedId = useSearchParams().get("c");
  const { user, conversations } = useStore();
  const { features } = useConfig();
  const [filter, setFilter] = useState("");
  const isPhone = useMediaQuery("(max-width: 767px)");
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-950">Log in to see your messages</h1>
        <Link href="/sign-in?next=/inbox" className={buttonClass("dark", "lg", "mt-6")}>
          Continue with your student email
        </Link>
      </div>
    );
  }

  if (!features.messaging) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <MessageCircle className="mx-auto size-8 text-ink-300" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-ink-950">Messaging is paused</h1>
        <p className="mt-2 text-sm text-ink-500">
          The team has turned chat off for now. Your conversations are safe and will be back soon.
        </p>
      </div>
    );
  }

  const select = (id: string | null) => router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false });
  const q = filter.trim().toLowerCase();
  const visible = q
    ? conversations.filter((c) => c.sellerName.toLowerCase().includes(q) || c.messages.some((m) => m.text.toLowerCase().includes(q)))
    : conversations;
  const unread = conversations.reduce((n, c) => n + c.unread, 0);

  return (
    <div className="md:grid md:h-[calc(100dvh-11rem)] md:min-h-[520px] md:grid-cols-[340px_1fr] md:overflow-hidden md:rounded-2xl md:border md:border-line">
      {/* Conversation list: the whole page on phones, a sidebar on larger screens */}
      <aside className="flex min-h-0 flex-col md:border-r md:border-line">
        <div className="px-1 pt-2 pb-3 md:px-4 md:pt-5">
          <h1 className="flex items-baseline gap-2 text-2xl font-semibold tracking-[-0.025em] text-ink-950 md:text-xl">
            Messages {unread > 0 && <span className="text-sm font-medium text-maroon-700">{unread} new</span>}
          </h1>
          <label className="mt-3 flex h-10 items-center gap-2 rounded-xl bg-surface px-3 text-sm">
            <Search className="size-4 text-ink-500" aria-hidden />
            <span className="sr-only">Search conversations</span>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search conversations"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-500"
            />
          </label>
        </div>
        {visible.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
            <MessageCircle className="size-8 text-ink-300" aria-hidden />
            <p className="mt-3 text-sm text-ink-500">
              {q ? "No conversations match." : "No chats yet. Tap Message on any listing to ask the seller a question."}
            </p>
          </div>
        ) : (
          <ul className="flex-1 divide-y divide-line overflow-y-auto md:divide-y-0 md:px-2 md:pb-2">
            {visible.map((c) => (
              <ConversationRow key={c.id} convo={c} active={c.id === selectedId} onSelect={() => select(c.id)} />
            ))}
          </ul>
        )}
      </aside>

      {/* Desktop thread pane */}
      <section className="hidden min-h-0 md:block">
        {selected && !isPhone ? (
          <Thread key={selected.id} convo={selected} onBack={() => select(null)} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-surface text-ink-950">
              <MessageCircle className="size-6" aria-hidden />
            </span>
            <p className="mt-4 font-medium text-ink-950">Pick a conversation</p>
            <p className="mt-1 text-sm text-ink-500">Chats stay on Hilltop, so there&rsquo;s a record if anything goes wrong.</p>
          </div>
        )}
      </section>

      {/* Phone thread: a full-screen chat that slides in over everything */}
      <AnimatePresence>
        {selected && isPhone && <MobileThread key={selected.id} convo={selected} onBack={() => select(null)} />}
      </AnimatePresence>
    </div>
  );
}

function ConversationRow({ convo, active, onSelect }: { convo: Conversation; active: boolean; onSelect: () => void }) {
  const { allListings } = useStore();
  const listing = findListing(allListings, convo.listingId);
  const last = convo.messages.at(-1);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active}
        className={cn(
          "flex w-full items-center gap-3 px-1 py-3.5 text-left transition-colors md:rounded-xl md:p-3",
          active ? "md:bg-surface" : "md:hover:bg-surface",
        )}
      >
        <span className="relative shrink-0">
          <Avatar name={convo.sellerName} size={50} />
          {listing && (
            <span className="absolute -right-1 -bottom-1 size-6 overflow-hidden rounded-md border-2 border-canvas">
              <Image src={listing.images[0]} alt="" fill sizes="24px" className="object-cover" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-[15px]", convo.unread ? "font-semibold text-ink-950" : "font-medium text-ink-900")}>
              {convo.sellerName}
            </span>
            {last && (
              <RelativeTime
                at={last.at}
                className={cn("shrink-0 text-xs", convo.unread ? "font-medium text-maroon-700" : "text-ink-500")}
              />
            )}
          </span>
          <span className="block truncate text-xs text-ink-500">{listing?.title}</span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-[13px]", convo.unread ? "font-medium text-ink-950" : "text-ink-500")}>
              {last?.from === "me" && "You: "}
              {last?.deleted ? <span className="italic">Message deleted</span> : last?.text}
            </span>
            {convo.unread > 0 && (
              <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-maroon-700 px-1.5 text-[11px] leading-5 font-semibold text-white">
                {convo.unread}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Full-screen chat for phones, with its own header and a composer pinned above the keyboard. */
function MobileThread({ convo, onBack }: { convo: Conversation; onBack: () => void }) {
  useBodyScrollLock(true);
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Chat with ${convo.sellerName}`}
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 420, damping: 42 }}
      className="fixed inset-0 z-[65] flex h-dvh flex-col bg-canvas md:hidden"
    >
      <Thread convo={convo} onBack={onBack} />
    </motion.div>
  );
}

const quickReplies = {
  buying: ["Is it still available?", "Can we meet today?", "Is the price negotiable?", "Where can we meet?"],
  selling: ["Yes, it's still available", "I can meet today", "Library works for me", "Sorry, it's sold"],
};

const dayLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** Groups consecutive messages by sender and inserts a label whenever the day changes. */
function groupMessages(messages: Message[]) {
  const out: ({ kind: "day"; label: string; key: string } | { kind: "msg"; m: Message; first: boolean; last: boolean })[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const day = new Date(m.at).toDateString();
    if (!prev || new Date(prev.at).toDateString() !== day) out.push({ kind: "day", label: dayLabel.format(m.at), key: `d-${m.id}` });
    const samePrev = prev && prev.from === m.from && new Date(prev.at).toDateString() === day && m.at - prev.at < 5 * 60_000;
    const sameNext = next && next.from === m.from && new Date(next.at).toDateString() === day && next.at - m.at < 5 * 60_000;
    out.push({ kind: "msg", m, first: !samePrev, last: !sameNext });
  });
  return out;
}

function Thread({ convo, onBack }: { convo: Conversation; onBack: () => void }) {
  const { allListings, sendMessage, readConversation, editMessage, deleteMessage, user } = useStore();
  const listing = findListing(allListings, convo.listingId);
  const selling = convo.role === "selling";
  const [text, setText] = useState("");
  // The message whose actions are open, and the one being edited.
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [theyType, setTheyType] = useState(false);
  const typing = useRef<{ typing: () => void; leave: () => void } | null>(null);

  // Live "typing…" from the other person; nothing is stored.
  useEffect(() => {
    if (!user?.profileId || convo.id.startsWith("c-")) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    typing.current = joinTyping(convo.id, user.profileId, () => {
      setTheyType(true);
      clearTimeout(timer);
      timer = setTimeout(() => setTheyType(false), 4000);
    });
    return () => {
      clearTimeout(timer);
      typing.current?.leave();
      typing.current = null;
    };
  }, [convo.id, user?.profileId]);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const awaitingReply = convo.messages.at(-1)?.from === "me";
  const items = useMemo(() => groupMessages(convo.messages), [convo.messages]);
  const lastMine = [...convo.messages].reverse().find((m) => m.from === "me");
  const seen = !!lastMine?.read || (!!lastMine && convo.messages.some((m) => m.from === "them" && m.at > lastMine.at));

  useEffect(() => {
    readConversation(convo.id);
  }, [convo.id, convo.messages.length, readConversation]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [convo.messages.length, awaitingReply]);

  function send(body: string) {
    if (!body.trim()) return;
    if (editing) {
      if (body.trim() !== editing.text) editMessage(convo.id, editing.id, body);
      setEditing(null);
    } else {
      if (!listing) return;
      sendMessage(listing, convo.sellerName, body.trim(), convo.id);
    }
    setText("");
    setTheyType(false);
    if (input.current) input.current.style.height = "";
  }

  function startEditing(m: Message) {
    setEditing(m);
    setPicked(null);
    setText(m.text);
    requestAnimationFrame(() => input.current?.focus());
  }

  const now = useNow();
  const canEdit = (m: Message) => !m.deleted && !m.pending && !!now && now - m.at < EDIT_WINDOW_MS;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-line bg-canvas/90 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur md:px-5 md:py-3">
        <button
          type="button"
          onClick={onBack}
          className="grid size-10 place-items-center rounded-full hover:bg-surface md:hidden"
          aria-label="Back to messages"
        >
          <ArrowLeft className="size-5" />
        </button>
        <Avatar name={convo.sellerName} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink-950">{convo.sellerName}</p>
          <p className="flex items-center gap-1 text-xs text-ink-500">
            <ShieldCheck className="size-3.5 text-maroon-700" aria-hidden /> {theyType ? "typing…" : "Ashesi student"}
          </p>
        </div>
        {listing && (
          <Link
            href={`/listing/${listing.id}`}
            className="grid size-10 place-items-center rounded-full hover:bg-surface"
            aria-label="Open listing"
          >
            <ExternalLink className="size-[18px]" />
          </Link>
        )}
      </header>

      {listing && (
        <Link
          href={`/listing/${listing.id}`}
          className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5 hover:bg-surface-2 md:px-5"
        >
          <span className="relative size-11 shrink-0 overflow-hidden rounded-lg">
            <Image src={listing.images[0]} alt="" fill sizes="44px" className="object-cover" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink-950">{listing.title}</span>
            <span className="text-xs text-ink-500 tabular">{formatCedi(listing.price)}</span>
          </span>
          {selling ? (
            <span className="text-xs font-medium text-ink-500">Your listing</span>
          ) : (
            <span className={buttonClass("dark", "sm")}>Buy</span>
          )}
        </Link>
      )}

      <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 md:px-6" aria-live="polite">
        <p className="mx-auto mb-4 max-w-xs rounded-xl bg-surface px-3 py-2 text-center text-[11px] leading-4 text-ink-500">
          Meet somewhere public on campus, and only pay once you have the item. Never send money in advance.
        </p>
        <AnimatePresence initial={false}>
          {items.map((it) =>
            it.kind === "day" ? (
              <motion.p key={it.key} layout className="my-4 text-center text-[11px] font-medium text-ink-500">
                {it.label}
              </motion.p>
            ) : (
              <motion.div
                key={it.m.id}
                layout
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 36 }}
                className={cn("flex", it.m.from === "me" ? "justify-end" : "justify-start", it.first ? "mt-3" : "mt-0.5")}
              >
                <div
                  role={it.m.from === "me" && !it.m.deleted ? "button" : undefined}
                  tabIndex={it.m.from === "me" && !it.m.deleted ? 0 : undefined}
                  aria-label={it.m.from === "me" && !it.m.deleted ? "Message options" : undefined}
                  onClick={() => it.m.from === "me" && !it.m.deleted && setPicked(picked === it.m.id ? null : it.m.id)}
                  onKeyDown={(e) => e.key === "Enter" && it.m.from === "me" && !it.m.deleted && setPicked(it.m.id)}
                  className={cn(
                    "max-w-[80%] px-3.5 py-2 text-[15px] leading-6 break-words md:max-w-[70%] md:text-sm",
                    it.m.from === "me" && !it.m.deleted && "cursor-pointer",
                    it.m.deleted
                      ? "border border-dashed border-line-strong bg-transparent text-ink-500 italic"
                      : it.m.from === "me"
                        ? "bg-ink-950 text-canvas"
                        : "bg-surface text-ink-950",
                    it.m.pending && "opacity-70",
                    it.m.from === "me"
                      ? cn("rounded-2xl", !it.first && "rounded-tr-md", !it.last && "rounded-br-md", it.last && "rounded-br-md")
                      : cn("rounded-2xl", !it.first && "rounded-tl-md", !it.last && "rounded-bl-md", it.last && "rounded-bl-md"),
                  )}
                >
                  {it.m.deleted ? "This message was deleted" : it.m.text}
                  {(it.last || it.m.edited) && (
                    <span
                      className={cn(
                        "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
                        it.m.from === "me" ? "text-canvas/60" : "text-ink-500",
                      )}
                    >
                      {it.m.edited && !it.m.deleted && <span>edited ·</span>}
                      <RelativeTime at={it.m.at} />
                      {it.m.from === "me" &&
                        it.m.id === lastMine?.id &&
                        (seen ? <CheckCheck className="size-3" aria-label="Seen" /> : <Check className="size-3" aria-label="Sent" />)}
                    </span>
                  )}
                </div>
                {picked === it.m.id && (
                  <div className="ml-2 flex shrink-0 items-center gap-1 self-center">
                    {canEdit(it.m) && (
                      <button
                        type="button"
                        onClick={() => startEditing(it.m)}
                        aria-label="Edit message"
                        className="grid size-8 place-items-center rounded-full bg-surface text-ink-700 hover:text-ink-950"
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </button>
                    )}
                    {!it.m.pending && (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        aria-label="Delete message"
                        className="grid size-8 place-items-center rounded-full bg-surface text-maroon-700 hover:bg-maroon-50"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            ),
          )}
        </AnimatePresence>
        {theyType && (
          <p className="mt-3 text-xs text-ink-500" aria-live="polite">
            {convo.sellerName.split(" ")[0]} is typing…
          </p>
        )}
      </div>

      {confirmDelete && picked && (
        <div className="flex items-center justify-between gap-3 border-t border-line bg-maroon-50 px-4 py-2.5 text-[13px] md:px-5">
          <span className="text-ink-950">Delete this message for everyone?</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass("ghost", "sm")}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                deleteMessage(convo.id, picked);
                setConfirmDelete(false);
                setPicked(null);
              }}
              className={buttonClass("dark", "sm")}
            >
              Delete
            </button>
          </span>
        </div>
      )}

      <div className="border-t border-line bg-canvas px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5 md:pb-3">
        {editing && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 text-ink-700">
              <Pencil className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">Editing: {editing.text}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setText("");
              }}
              aria-label="Cancel editing"
              className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-surface-2"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        )}
        <div className={cn("-mx-3 mb-2 no-scrollbar flex gap-1.5 overflow-x-auto px-3 md:mx-0 md:px-0", editing && "hidden")}>
          {quickReplies[selling ? "selling" : "buying"].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => send(q)}
              className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-ink-700 hover:border-ink-950 hover:text-ink-950"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <label className="sr-only" htmlFor={`composer-${convo.id}`}>
            Message {convo.sellerName}
          </label>
          <textarea
            ref={input}
            id={`composer-${convo.id}`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (!editing) typing.current?.typing();
              // Grow with the text up to a few lines.
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(hover: hover)").matches) {
                e.preventDefault();
                send(text);
              }
            }}
            rows={1}
            enterKeyHint="send"
            placeholder={editing ? "Edit message" : "Message"}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-line-strong bg-elevated px-4 py-2.5 text-[16px] leading-6 outline-none focus:border-ink-950 md:text-sm"
          />
          <motion.button
            type="submit"
            whileTap={{ scale: 0.9 }}
            disabled={!text.trim()}
            aria-label="Send"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-maroon-700 text-white transition-opacity disabled:opacity-40"
          >
            <ArrowUp className="size-5" strokeWidth={2.5} />
          </motion.button>
        </form>
      </div>
    </div>
  );
}
