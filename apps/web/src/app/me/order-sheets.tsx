"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { getSeller } from "@/lib/data";
import { useConfig } from "@/lib/config";
import { findListing, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { isHeld } from "@/lib/model";
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

  function submit() {
    if (!order || !rating) return;
    addReview({ sellerId: getSeller(sellerId)?.id ?? sellerId, orderId: order.id, rating, tags, text: text.trim() });
    setDone(true);
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
          <button type="button" disabled={!rating} onClick={submit} className={buttonClass("dark", "lg", "w-full")}>
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
          <p className="text-sm text-ink-500">Payment released. How was the meet-up with {name}?</p>
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
