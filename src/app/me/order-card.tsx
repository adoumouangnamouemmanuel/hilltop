"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, Lock, MapPin, ShieldAlert, Star, Wallet } from "lucide-react";
import { formatCedi } from "@/lib/format";
import { disputeReasons, orderProgress, payoutState } from "@/lib/model";
import { findListing, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Order } from "@/lib/types";
import { RelativeTime } from "@/components/controls";
import { OrderTimeline } from "@/components/order-timeline";
import { buttonClass, cn } from "@/components/ui";

const statusLabel: Record<Order["status"], { label: string; tone: string }> = {
  paid: { label: "Paid, awaiting pickup", tone: "bg-warning-bg text-warning" },
  ready: { label: "Ready for pickup", tone: "bg-warning-bg text-warning" },
  collected: { label: "Completed", tone: "bg-success-bg text-success" },
  disputed: { label: "Under review", tone: "bg-maroon-50 text-maroon-700" },
  refunded: { label: "Refunded", tone: "bg-surface text-ink-700" },
};

const payoutCopy = {
  held: "Held by Hilltop until the buyer confirms",
  released: "Paid out to your MoMo",
  frozen: "Frozen while a problem is reviewed",
  refunded: "Refunded to the buyer",
} as const;

export function OrderCard({ order, onReport, onReview }: { order: Order; onReport: (o: Order) => void; onReview: (o: Order) => void }) {
  const { allListings, confirmCollection, markReady, withdrawDispute, resolveDispute } = useStore();
  const [confirming, setConfirming] = useState(false);
  const listing = findListing(allListings, order.listingId);
  if (!listing) return null;
  const selling = order.role === "selling";
  const status = statusLabel[order.status];
  const open = order.status === "paid" || order.status === "ready";
  const payout = payoutState(order);

  return (
    <motion.li layout className="rounded-2xl border border-line p-4 sm:p-5">
      <div className="flex gap-4">
        <Link href={`/listing/${listing.id}`} className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface">
          <Image src={listing.images[0]} alt={listing.title} fill sizes="80px" className="object-cover" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/listing/${listing.id}`} className="block truncate text-[15px] font-medium text-ink-950 hover:underline">
                {listing.title}
                {order.quantity > 1 && <span className="text-ink-500"> x {order.quantity}</span>}
              </Link>
              <p className="mt-0.5 text-xs text-ink-500">
                {order.id.replace("ord-", "#")} · <RelativeTime at={order.placedAt} /> · {selling ? "to" : "from"} {order.counterpart}
              </p>
            </div>
            <p className="shrink-0 text-[15px] font-semibold text-ink-950 tabular">
              {formatCedi(selling ? order.amount : order.amount + order.fee)}
            </p>
          </div>
          <span className={cn("mt-2 inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold", status.tone)}>{status.label}</span>
        </div>
      </div>

      <div className="mt-5 sm:pl-24">
        <OrderTimeline reached={orderProgress(order.status)} />
      </div>

      {selling && (
        <p className="mt-4 flex items-center gap-2 text-xs text-ink-700 sm:pl-24">
          <Wallet className="size-3.5 text-ink-500" aria-hidden /> Payout: {payoutCopy[payout]}
        </p>
      )}

      {order.dispute?.state === "open" && (
        <div className="mt-4 rounded-xl border border-maroon-200 bg-maroon-50 p-3.5 text-[13px]">
          <p className="flex items-center gap-2 font-medium text-maroon-700">
            <ShieldAlert className="size-4" aria-hidden /> {selling ? "The buyer reported a problem" : "You reported a problem"}:{" "}
            {disputeReasons[order.dispute.reason]}
          </p>
          {order.dispute.details && <p className="mt-1 text-ink-700">&ldquo;{order.dispute.details}&rdquo;</p>}
          <p className="mt-1 text-ink-500">Hilltop support replies within 24 hours. The payment stays frozen until then.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!selling && (
              <button type="button" onClick={() => withdrawDispute(order.id)} className={buttonClass("outline", "sm")}>
                Withdraw report
              </button>
            )}
            {/* Stand-ins for the support team's decision in the demo. */}
            <button type="button" onClick={() => resolveDispute(order.id, "refunded")} className={buttonClass("ghost", "sm")}>
              Demo: approve refund
            </button>
            <button type="button" onClick={() => resolveDispute(order.id, "released")} className={buttonClass("ghost", "sm")}>
              Demo: release payment
            </button>
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={false} exit={{ height: 0, opacity: 0, marginTop: 0 }} className="mt-5 overflow-hidden">
            <div className="flex flex-col gap-3 rounded-xl bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-xs text-ink-700">
                <p className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-ink-500" aria-hidden /> {listing.pickup}
                  {order.slot && <>, {order.slot}</>}
                </p>
                <p className="flex items-center gap-1.5">
                  <Lock className="size-3.5 text-ink-500" aria-hidden />
                  {selling ? "You're paid when the buyer confirms collection" : "Payment held until you confirm"}
                </p>
              </div>
              {selling ? (
                order.status === "paid" ? (
                  <button
                    type="button"
                    onClick={() => {
                      markReady(order.id);
                      toast(`${order.counterpart.split(" ")[0]} has been told it's ready`, { tone: "success" });
                    }}
                    className={buttonClass("dark", "sm")}
                  >
                    <Check className="size-3.5" aria-hidden /> Mark ready for pickup
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-ink-700">
                    <Clock className="size-3.5" aria-hidden /> Waiting for the buyer to collect
                  </span>
                )
              ) : confirming ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirming(false)} className={buttonClass("outline", "sm")}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      confirmCollection(order.id);
                      onReview(order);
                    }}
                    className={buttonClass("dark", "sm")}
                  >
                    <Check className="size-3.5" aria-hidden /> Yes, release payment
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" onClick={() => onReport(order)} className={buttonClass("ghost", "sm")}>
                    Report a problem
                  </button>
                  <button type="button" onClick={() => setConfirming(true)} className={buttonClass("dark", "sm")}>
                    I&rsquo;ve collected it
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!selling && order.status === "collected" && !order.reviewed && (
        <button
          type="button"
          onClick={() => onReview(order)}
          className="mt-4 flex w-full items-center justify-between rounded-xl border border-line px-3.5 py-3 text-left text-sm hover:border-ink-950"
        >
          <span className="text-ink-700">How was {order.counterpart.split(" ")[0]}? Leave a review</span>
          <span className="flex gap-0.5 text-ink-300" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} className="size-4" />
            ))}
          </span>
        </button>
      )}
    </motion.li>
  );
}
