"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, Check, Clock, Handshake, Lock, MapPin, ShieldAlert, Star, Wallet } from "lucide-react";
import { autoReleaseAt } from "@hilltop/shared/payments";
import { formatCedi } from "@/lib/format";
import { disputeLabel, isHeld, orderProgress, paymentOf, payoutState } from "@/lib/model";
import { useNow } from "@/lib/hooks";
import { useConfig } from "@/lib/config";
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

const paidLabel = { protected: "Paid, awaiting pickup", deposit: "Deposit paid, awaiting pickup", pickup: "Reserved, pay at pickup" };

const payoutCopy = {
  direct: "The buyer pays you directly at pickup",
  held: "Held by Hilltop until the buyer confirms",
  released: "Paid out to your MoMo",
  frozen: "Frozen while a problem is reviewed",
  refunded: "Refunded to the buyer",
} as const;

export function OrderCard({ order, onReport, onReview }: { order: Order; onReport: (o: Order) => void; onReview: (o: Order) => void }) {
  const { allListings, confirmCollection, markReady, markHandedOver, withdrawDispute, resolveDispute } = useStore();
  const { brand, disputes, features, protection } = useConfig();
  const now = useNow();
  const [confirming, setConfirming] = useState(false);
  const listing = findListing(allListings, order.listingId);
  if (!listing) return null;
  const selling = order.role === "selling";
  const pay = paymentOf(order);
  const held = isHeld(order);
  const status = order.status === "paid" ? { ...statusLabel.paid, label: paidLabel[pay.kind] } : statusLabel[order.status];
  const open = order.status === "paid" || order.status === "ready";
  const payout = payoutState(order);
  const releaseAt = autoReleaseAt(order.handedOverAt, protection.autoReleaseHours);
  const hoursLeft = releaseAt && now ? Math.max(1, Math.ceil((releaseAt - now) / 3_600_000)) : null;
  const first = order.counterpart.split(" ")[0];

  // What happens to the money, from this person's side.
  const moneyLine = selling
    ? pay.kind === "pickup"
      ? `${first} pays you ${formatCedi(pay.dueAtPickup)} at pickup`
      : order.handedOverAt && hoursLeft
        ? `Paid to you in ${hoursLeft}h unless ${first} reports a problem`
        : pay.kind === "deposit"
          ? `Collect ${formatCedi(pay.dueAtPickup)} at pickup. The deposit is paid out after collection`
          : "You're paid when the buyer confirms collection"
    : pay.kind === "pickup"
      ? `Pay ${formatCedi(pay.dueAtPickup)} to the seller at pickup`
      : order.handedOverAt && hoursLeft
        ? `Released to ${first} automatically in ${hoursLeft}h unless you report a problem`
        : pay.kind === "deposit"
          ? `Deposit held. Pay ${formatCedi(pay.dueAtPickup)} to the seller at pickup`
          : "Payment held until you confirm";

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
        <OrderTimeline reached={orderProgress(order.status, held)} kind={pay.kind} />
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
            {disputeLabel(disputes.reasons, order.dispute.reason)}
          </p>
          {order.dispute.details && <p className="mt-1 text-ink-700">&ldquo;{order.dispute.details}&rdquo;</p>}
          <p className="mt-1 text-ink-500">
            Hilltop support replies within {disputes.responseHours} hours. The payment stays frozen until then.
          </p>
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
                  {held ? (
                    <Lock className="size-3.5 text-ink-500" aria-hidden />
                  ) : (
                    <Banknote className="size-3.5 text-ink-500" aria-hidden />
                  )}
                  {moneyLine}
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
                ) : !order.handedOverAt ? (
                  <button
                    type="button"
                    onClick={() => {
                      markHandedOver(order.id);
                      toast(held ? `Handover recorded. ${first} can confirm or report a problem.` : "Order complete", { tone: "success" });
                    }}
                    className={buttonClass("dark", "sm")}
                  >
                    <Handshake className="size-3.5" aria-hidden /> {held ? "I've handed it over" : "Collected and paid"}
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-ink-700">
                    <Clock className="size-3.5" aria-hidden /> Waiting for {first} to confirm
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
                      if (features.reviews) onReview(order);
                    }}
                    className={buttonClass("dark", "sm")}
                  >
                    <Check className="size-3.5" aria-hidden /> {held ? "Yes, release payment" : "Yes, collected and paid"}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  {held ? (
                    <button type="button" onClick={() => onReport(order)} className={buttonClass("ghost", "sm")}>
                      Report a problem
                    </button>
                  ) : (
                    <a
                      href={`mailto:${brand.supportEmail}?subject=${encodeURIComponent(`Problem with order ${order.id}`)}`}
                      className={buttonClass("ghost", "sm")}
                    >
                      Get help
                    </a>
                  )}
                  <button type="button" onClick={() => setConfirming(true)} className={buttonClass("dark", "sm")}>
                    I&rsquo;ve collected it
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {features.reviews && !selling && order.status === "collected" && !order.reviewed && (
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
