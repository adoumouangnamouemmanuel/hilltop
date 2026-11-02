"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { getSeller } from "@/lib/data";
import { useConfig } from "@/lib/config";
import { findListing, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { isHeld } from "@/lib/model";
import { loadDisputeMessages, hasMoreDisputeMessages, replyToDispute, type DisputeMessage } from "@/lib/orders";
import type { DisputeReason, Order } from "@/lib/types";
import { Confetti } from "@/components/confetti";
import { Stars } from "@/components/controls";
import { Sheet } from "@/components/sheet";
import { buttonClass, cn } from "@/components/ui";

/** Buyer reports a problem: opens a case for the team and holds the order (and any payment). */
export function DisputeSheet({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const { openDispute } = useStore();
  const { reasons, responseHours } = useConfig().disputes;
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const held = !!order && isHeld(order);

  async function submit() {
    if (!order || !reason) return;
    setSending(true);
    const ok = await openDispute(order.id, reason, details.trim());
    setSending(false);
    if (!ok) return;
    toast(held ? "Problem reported. Your payment is frozen." : "Problem reported. The Hilltop team will be in touch.", { tone: "success" });
    setReason(null);
    setDetails("");
    onClose();
  }

  return (
    <Sheet
      open={!!order}
      onClose={onClose}
      title="Report a problem"
      footer={
        <button
          type="button"
          disabled={!reason || (reason === "other" && !details.trim()) || sending}
          onClick={submit}
          className={buttonClass("dark", "lg", "w-full")}
        >
          {held ? "Report and freeze payment" : "Report the problem"}
        </button>
      }
    >
      <p className="text-sm leading-6 text-ink-500">
        {held
          ? "We hold the payment while our team looks into it. If the item isn\u2019t as described, you get a full refund."
          : `The order is put on hold and the Hilltop team replies within ${responseHours} hours. The seller sees your report too.`}
      </p>
      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-ink-950">What went wrong?</legend>
        <div className="mt-2.5 grid gap-2">
          {reasons.map(({ id: r, label }) => (
            <label
              key={r}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors",
                reason === r ? "border-ink-950 bg-surface" : "border-line-strong hover:border-ink-400",
              )}
            >
              <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="peer sr-only" />
              <span
                className={cn(
                  "grid size-[18px] place-items-center rounded-full border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-maroon-600",
                  reason === r ? "border-ink-950" : "border-line-strong",
                )}
              >
                {reason === r && <span className="size-2 rounded-full bg-ink-950" />}
              </span>
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-5 block">
        <span className="text-sm font-semibold text-ink-950">
          Tell us more {reason !== "other" && <span className="font-normal text-ink-500">(optional)</span>}
        </span>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 500))}
          rows={4}
          placeholder="What did you expect, and what did you get?"
          className="mt-2 w-full resize-none rounded-xl border border-line-strong bg-elevated p-3 text-sm outline-none focus:border-ink-950"
        />
      </label>
    </Sheet>
  );
}

const reviewTags = ["Item as described", "On time", "Friendly", "Good price", "Quick replies"];

/** Rate the seller after collection. Feeds the seller's rating. */
export function ReviewSheet({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const { allListings, addReview } = useStore();
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const [posting, setPosting] = useState(false);
  const listing = order ? findListing(allListings, order.listingId) : null;
  const sellerId = listing?.sellerId ?? "";
  const name = order?.counterpart.split(" ")[0] ?? "the seller";

  function close() {
    onClose();
    setTimeout(() => {
      setRating(0);
      setTags([]);
      setText("");
      setDone(false);
    }, 300);
  }

  async function submit() {
    if (!order || !rating || posting) return;
    setPosting(true);
    try {
      if (await addReview({ sellerId: getSeller(sellerId)?.id ?? sellerId, orderId: order.id, rating, tags, text: text.trim() }))
        setDone(true);
    } finally {
      setPosting(false);
    }
  }

  return (
    <Sheet
      open={!!order}
      onClose={close}
      title={done ? "Thanks!" : `Review ${name}`}
      footer={
        done ? (
          <button type="button" onClick={close} className={buttonClass("dark", "lg", "w-full")}>
            Done
          </button>
        ) : (
          <button type="button" disabled={!rating || posting} onClick={submit} className={buttonClass("dark", "lg", "w-full")}>
            Post review
          </button>
        )
      }
    >
      {done ? (
        <div className="py-6 text-center">
          <span className="relative mx-auto grid size-16 place-items-center">
            <Confetti count={12} spread={50} delay={0.1} size={6} />
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 14 }}
              className="relative grid size-14 place-items-center rounded-full bg-success-bg text-success"
            >
              <Check className="size-7" strokeWidth={2.5} aria-hidden />
            </motion.span>
          </span>
          <p className="mt-4 text-sm text-ink-500">Your review helps other students buy with confidence.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-500">How was the meet-up with {name}?</p>
          <div className="mt-5 flex justify-center">
            <Stars value={rating} onChange={setRating} size={34} />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {reviewTags.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tags.includes(t)}
                onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors",
                  tags.includes(t) ? "border-ink-950 bg-ink-950 text-canvas" : "border-line-strong text-ink-700 hover:border-ink-950",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 400))}
            rows={3}
            placeholder="Anything else? (optional)"
            aria-label="Review text"
            className="mt-5 w-full resize-none rounded-xl border border-line-strong bg-elevated p-3 text-sm outline-none focus:border-ink-950"
          />
        </>
      )}
    </Sheet>
  );
}

/** A case remains readable after resolution; new replies require an open case. */
export function DisputeConversation({ order }: { order: Order }) {
  const params = useSearchParams();
  const [open, setOpen] = useState(() => params.get("case") === order.dispute?.id);
  const [messages, setMessages] = useState<DisputeMessage[]>([]);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const id = order.dispute?.id;
  async function refresh() {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      setMessages(await loadDisputeMessages(id));
    } catch {
      setError("Couldn't load the case conversation. Try again.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!open || !id) return;
    let active = true;
    const load = () =>
      loadDisputeMessages(id)
        .then((next) => {
          if (active) {
            setMessages(next);
            setError("");
          }
        })
        .catch(() => {
          if (active) setError("Couldn't refresh the conversation. Try again.");
        });
    void load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [open, id]);
  if (!id) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("outline", "sm", "mt-3")}>
        View dispute conversation
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Dispute conversation">
        <p className="text-sm text-ink-500">
          Buyer, seller and support can follow the case here. {order.dispute?.state !== "open" && "This case is closed."}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-warning">
            {error}
          </p>
        )}
        <button type="button" disabled={busy} onClick={refresh} className={buttonClass("ghost", "sm", "mt-2")}>
          {busy ? "Loading…" : "Refresh conversation"}
        </button>
        <ol className="my-4 space-y-3" aria-label="Case messages">
          {messages.map((message) => (
            <li key={message.id} className="rounded-xl bg-surface p-3">
              <p className="text-xs text-ink-500 capitalize">
                {message.role} · {new Date(message.at).toLocaleString()}
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-ink-950">{message.body}</p>
            </li>
          ))}
        </ol>
        {hasMoreDisputeMessages(id) && (
          <button
            type="button"
            disabled={busy}
            className={buttonClass("outline", "sm")}
            onClick={async () => {
              setBusy(true);
              try {
                setMessages(await loadDisputeMessages(id, true));
              } catch {
                setError("Could not load older replies. Try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Load older replies
          </button>
        )}
        {messages.length === 0 && !error && <p className="my-4 text-sm text-ink-500">No replies yet.</p>}
        {order.dispute?.state === "open" && (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!body.trim() || busy) return;
              setBusy(true);
              setError("");
              try {
                const failure = await replyToDispute(id, body.trim());
                if (failure) setError(failure);
                else {
                  setBody("");
                  await refresh();
                }
              } catch {
                setError("Couldn't confirm your reply. Check the conversation before retrying.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block text-sm font-medium">
              Your reply
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={2000}
                rows={4}
                disabled={busy}
                className="mt-2 w-full rounded-xl border border-line-strong p-3"
              />
            </label>
            <button type="submit" disabled={busy || !body.trim()} className={buttonClass("dark", "md", "mt-3")}>
              {busy ? "Sending…" : "Send reply"}
            </button>
          </form>
        )}
      </Sheet>
    </>
  );
}
