"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, MessageCircle, SendHorizontal } from "lucide-react";
import { firstName, formatCedi } from "@/lib/format";
import { findListing, useStore } from "@/lib/store";
import type { Conversation } from "@/lib/types";
import { RelativeTime } from "@/components/controls";
import { Avatar, buttonClass, cn } from "@/components/ui";

export function InboxView() {
  const router = useRouter();
  const pathname = usePathname();
  const selectedId = useSearchParams().get("c");
  const { user, conversations } = useStore();
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-950">Log in to see your messages</h1>
        <Link href="/sign-in?next=/inbox" className={buttonClass("dark", "lg", "mt-6")}>
          Continue with Ashesi email
        </Link>
      </div>
    );
  }

  const select = (id: string | null) => router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false });

  return (
    <div className="grid h-[calc(100dvh-13rem)] min-h-[480px] overflow-hidden rounded-2xl border border-line md:h-[calc(100dvh-11rem)] md:grid-cols-[320px_1fr]">
      <aside className={cn("flex min-h-0 flex-col border-line md:border-r", selected && "max-md:hidden")}>
        <h1 className="px-5 pt-5 pb-3 text-xl font-semibold tracking-[-0.02em] text-ink-950">Messages</h1>
        {conversations.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <MessageCircle className="size-8 text-ink-300" aria-hidden />
            <p className="mt-3 text-sm text-ink-500">No chats yet. Tap Message on any listing to ask the seller a question.</p>
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto px-2 pb-2">
            {conversations.map((c) => (
              <ConversationRow key={c.id} convo={c} active={c.id === selectedId} onSelect={() => select(c.id)} />
            ))}
          </ul>
        )}
      </aside>
      <section className={cn("min-h-0", !selected && "max-md:hidden")}>
        {selected ? (
          <Thread key={selected.id} convo={selected} onBack={() => select(null)} />
        ) : (
          <div className="hidden h-full flex-col items-center justify-center text-center md:flex">
            <span className="grid size-14 place-items-center rounded-2xl bg-surface text-ink-950">
              <MessageCircle className="size-6" aria-hidden />
            </span>
            <p className="mt-4 font-medium text-ink-950">Pick a conversation</p>
            <p className="mt-1 text-sm text-ink-500">Chats stay on Hilltop, so there&rsquo;s a record if anything goes wrong.</p>
          </div>
        )}
      </section>
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
          "flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors",
          active ? "bg-surface" : "hover:bg-surface",
        )}
      >
        <span className="relative">
          <Avatar name={convo.sellerName} size={44} />
          {listing && (
            <span className="absolute -right-1 -bottom-1 size-6 overflow-hidden rounded-md border-2 border-elevated">
              <Image src={listing.images[0]} alt="" fill sizes="24px" className="object-cover" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-sm", convo.unread ? "font-semibold text-ink-950" : "font-medium text-ink-900")}>
              {convo.sellerName}
            </span>
            {last && <RelativeTime at={last.at} className="shrink-0 text-[11px] text-ink-500" />}
          </span>
          <span className="block truncate text-xs text-ink-500">{listing?.title}</span>
          <span className={cn("block truncate text-[13px]", convo.unread ? "text-ink-950" : "text-ink-500")}>
            {last?.from === "me" && "You: "}
            {last?.text}
          </span>
        </span>
        {convo.unread > 0 && (
          <span className="grid min-w-5 place-items-center rounded-full bg-maroon-700 px-1.5 text-[11px] leading-5 font-semibold text-white">
            {convo.unread}
          </span>
        )}
      </button>
    </li>
  );
}

const quickReplies = ["Is it still available?", "Can we meet today?", "Is the price negotiable?", "Can you send more photos?"];

function Thread({ convo, onBack }: { convo: Conversation; onBack: () => void }) {
  const { allListings, sendMessage, readConversation } = useStore();
  const listing = findListing(allListings, convo.listingId);
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const awaitingReply = convo.messages.at(-1)?.from === "me";

  useEffect(() => {
    readConversation(convo.id);
  }, [convo.id, convo.messages.length, readConversation]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [convo.messages.length, awaitingReply]);

  function send(body: string) {
    if (!listing || !body.trim()) return;
    sendMessage(listing, convo.sellerName, body.trim());
    setText("");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-3 py-3 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          className="grid size-9 place-items-center rounded-full hover:bg-surface md:hidden"
          aria-label="Back to messages"
        >
          <ArrowLeft className="size-5" />
        </button>
        <Avatar name={convo.sellerName} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-950">{convo.sellerName}</p>
          <p className="text-xs text-ink-500">Verified Ashesi student</p>
        </div>
      </header>

      {listing && (
        <Link
          href={`/listing/${listing.id}`}
          className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2.5 hover:bg-surface-2 sm:px-5"
        >
          <span className="relative size-11 shrink-0 overflow-hidden rounded-lg">
            <Image src={listing.images[0]} alt="" fill sizes="44px" className="object-cover" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink-950">{listing.title}</span>
            <span className="text-xs text-ink-500 tabular">{formatCedi(listing.price)}</span>
          </span>
          <span className={buttonClass("dark", "sm")}>View</span>
        </Link>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-5 sm:px-5" aria-live="polite">
        <p className="mx-auto mb-4 max-w-xs text-center text-[11px] text-ink-500">
          Keep payments on Hilltop. Never send MoMo directly, even if asked.
        </p>
        <AnimatePresence initial={false}>
          {convo.messages.map((m) => (
            <motion.div
              key={m.id}
              layout
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn("flex", m.from === "me" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-6",
                  m.from === "me" ? "rounded-br-md bg-ink-950 text-canvas" : "rounded-bl-md bg-surface text-ink-950",
                )}
              >
                {m.text}
                <RelativeTime at={m.at} className={cn("mt-0.5 block text-[10px]", m.from === "me" ? "text-canvas/60" : "text-ink-500")} />
              </div>
            </motion.div>
          ))}
          {awaitingReply && (
            <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-start">
              <span
                className="flex gap-1 rounded-2xl rounded-bl-md bg-surface px-4 py-3"
                aria-label={`${firstName(convo.sellerName)} is typing`}
              >
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="size-1.5 rounded-full bg-ink-400"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                  />
                ))}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={bottom} />
      </div>

      <div className="border-t border-line p-3 sm:px-5">
        <div className="-mx-1 mb-2 no-scrollbar flex gap-1.5 overflow-x-auto px-1">
          {quickReplies.map((q) => (
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
          <label className="sr-only" htmlFor="composer">
            Message {convo.sellerName}
          </label>
          <textarea
            id="composer"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            rows={1}
            placeholder="Write a message"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line-strong bg-elevated px-4 py-2.5 text-sm outline-none focus:border-ink-950"
          />
          <button type="submit" disabled={!text.trim()} className={buttonClass("dark", "md", "size-11 px-0")} aria-label="Send">
            <SendHorizontal className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
