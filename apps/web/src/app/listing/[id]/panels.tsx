"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Clock, MessageCircle, X } from "lucide-react";
import type { Listing } from "@/lib/data";
import { firstName, formatCedi } from "@/lib/format";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { buttonClass, cn } from "@/components/ui";

/** Offer form, then the offer's status once sent. The seller is notified and answers from their listing. */
export function OfferPanel({ listing, sellerName }: { listing: Listing; sellerName: string }) {
  const { offers, makeOffer } = useStore();
  const offer = offers[listing.id];
  const price = listing.price;
  const suggestions = [0.95, 0.9, 0.85].map((r) => Math.round((price * r) / 5) * 5);
  const [value, setValue] = useState(String(suggestions[1]));
  const amount = Number(value) || 0;
  const tooLow = amount > 0 && amount < price * 0.5;

  if (offer && offer.status !== "declined") {
    const accepted = offer.status === "accepted";
    return (
      <div
        role="status"
        className={cn(
          "mt-4 flex items-center gap-2.5 rounded-xl px-4 py-3 text-[13px]",
          accepted ? "bg-success-bg text-success" : "bg-surface text-ink-700",
        )}
      >
        {accepted ? <Check className="size-4 shrink-0" aria-hidden /> : <Clock className="size-4 shrink-0 animate-pulse" aria-hidden />}
        {accepted
          ? `${firstName(sellerName)} accepted ${formatCedi(offer.amount)}. Buy now to lock it in.`
          : `Offer of ${formatCedi(offer.amount)} sent. Waiting for ${firstName(sellerName)} to reply.`}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl bg-surface p-4">
      {offer?.status === "declined" && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-maroon-700">
          <X className="size-3.5" aria-hidden /> {firstName(sellerName)} declined {formatCedi(offer.amount)}. Try a little higher.
        </p>
      )}
      <div className="flex gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setValue(String(s))}
            className={cn(
              "flex-1 rounded-lg border py-1.5 text-xs tabular transition-colors",
              Number(value) === s
                ? "border-ink-950 bg-elevated font-medium text-ink-950"
                : "border-transparent bg-elevated text-ink-700 hover:border-line-strong",
            )}
          >
            {formatCedi(s)}
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex gap-2">
        <label className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-500">GH₵</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            aria-label="Your offer in cedis"
            className="h-11 w-full rounded-xl border border-line-strong bg-elevated pr-3 pl-12 text-sm tabular outline-none focus:border-ink-950"
          />
        </label>
        <button
          type="button"
          disabled={!amount || tooLow || amount >= price}
          onClick={async () => {
            const error = await makeOffer(listing, amount);
            toast(error ?? `Offer of ${formatCedi(amount)} sent`, error ? undefined : { tone: "success" });
          }}
          className={buttonClass("dark", "md")}
        >
          Send
        </button>
      </div>
      <p className={cn("mt-2 text-xs", tooLow ? "text-maroon-700" : "text-ink-500")}>
        {tooLow
          ? "Offers below half the asking price are hidden from sellers."
          : "If accepted, you'll pay through Hilltop with buyer protection."}
      </p>
    </div>
  );
}

/** Starts or continues a conversation about this listing. */
export function MessagePanel({ listing, sellerName }: { listing: Listing; sellerName: string }) {
  const { conversations, sendMessage } = useStore();
  const existing = conversations.find((c) => c.listingId === listing.id && c.role !== "selling");
  const quick = ["Is this still available?", "Can we meet today?", "Is the price negotiable?"];
  const [text, setText] = useState(`Hi ${firstName(sellerName)}, is this still available?`);

  return (
    <div className="mt-4 rounded-xl bg-surface p-4">
      {existing && (
        <Link
          href={`/inbox?c=${existing.id}`}
          className="mb-3 flex items-center justify-between rounded-lg bg-elevated px-3 py-2.5 text-[13px] text-ink-950 hover:bg-surface-2"
        >
          <span className="flex items-center gap-2">
            <MessageCircle className="size-4" aria-hidden /> Continue your chat with {firstName(sellerName)}
          </span>
          {existing.unread > 0 && (
            <span className="rounded-full bg-maroon-700 px-1.5 text-[11px] font-semibold text-white">{existing.unread}</span>
          )}
        </Link>
      )}
      <div className="-mx-1 no-scrollbar flex gap-1.5 overflow-x-auto px-1">
        {quick.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setText(q)}
            className="shrink-0 rounded-lg bg-elevated px-2.5 py-1.5 text-xs text-ink-700 hover:text-ink-950"
          >
            {q}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        aria-label={`Message to ${sellerName}`}
        className="mt-2.5 w-full resize-none rounded-xl border border-line-strong bg-elevated p-3 text-sm outline-none focus:border-ink-950"
      />
      <button
        type="button"
        disabled={!text.trim()}
        onClick={async () => {
          const body = text.trim();
          setText("");
          const id = await sendMessage(listing, sellerName, body);
          if (id) toast("Message sent", { tone: "success", action: { label: "Open chat", href: `/inbox?c=${id}` } });
          else setText(body);
        }}
        className={buttonClass("dark", "md", "mt-2 w-full")}
      >
        Send message
      </button>
    </div>
  );
}

/** Offers buyers made on the seller's own listing, newest first, to accept or decline. */
export function IncomingOffers({ listing }: { listing: Listing }) {
  const { incomingOffers, answerOffer } = useStore();
  const offers = (incomingOffers ?? []).filter((o) => o.listingId === listing.id && o.status !== "withdrawn");
  if (!offers.length) return null;
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-[13px] font-semibold text-ink-950">Offers</p>
      <ul className="mt-2 space-y-2">
        {offers.map((o) => (
          <li key={o.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-[13px]">
            <span className="min-w-0 flex-1">
              <span className="font-medium text-ink-950">{formatCedi(o.amount)}</span>
              <span className="text-ink-500"> from {firstName(o.buyerName)}</span>
            </span>
            {o.status === "pending" ? (
              <>
                <button type="button" onClick={() => answerOffer(o.id, false)} className={buttonClass("ghost", "sm")}>
                  Decline
                </button>
                <button type="button" onClick={() => answerOffer(o.id, true)} className={buttonClass("dark", "sm")}>
                  Accept
                </button>
              </>
            ) : (
              <span className={cn("text-xs font-medium", o.status === "accepted" ? "text-success" : "text-ink-500")}>
                {o.status === "accepted" ? "Accepted" : "Declined"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
