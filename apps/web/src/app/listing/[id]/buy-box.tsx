"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, ChevronDown, Clock, MessageCircle, ShieldCheck } from "lucide-react";
import type { Listing } from "@/lib/data";
import { useConfig } from "@/lib/config";
import { beforeCutoff, formatCedi, formatClock } from "@/lib/format";
import { percent } from "@hilltop/shared/config";
import { paymentPlan, type PaymentPlan } from "@hilltop/shared/payments";
import { useNow } from "@/lib/hooks";
import { isActive, isSoldOut } from "@/lib/model";
import { useStore } from "@/lib/store";
import { buttonClass, cn } from "@/components/ui";
import { MessagePanel, OfferPanel } from "./panels";

export type Panel = "offer" | "message" | null;

/** Buy now, offers, messages and the fee breakdown. Owners see a management shortcut instead. */
export function BuyBox({
  listing,
  sellerName,
  isOwn,
  unitPrice,
  panel,
  setPanel,
  onBuy,
}: {
  listing: Listing;
  sellerName: string;
  isOwn: boolean;
  unitPrice: number;
  panel: Panel;
  setPanel: (p: Panel) => void;
  onBuy: () => void;
}) {
  const { offers } = useStore();
  const config = useConfig();
  const { features, protection } = config;
  const now = useNow();
  const available = isActive(listing) && !isSoldOut(listing);
  const plan = paymentPlan(config, { total: unitPrice, category: listing.category, preorder: !!listing.food && features.foodOrdering });
  // Offers don't apply to made-to-order food; both buttons follow the admin's feature switches.
  const canOffer = features.offers && !listing.food;
  const actions = [canOffer, features.messaging].filter(Boolean).length;

  return (
    <div id="buy-box" className="mt-6 scroll-mt-40 rounded-2xl border border-line p-5">
      {isOwn ? (
        <div>
          <p className="text-sm text-ink-500">This is your listing. Buyers see Buy now and Make offer here.</p>
          <Link href={`/sell?edit=${listing.id}`} className={buttonClass("outline", "md", "mt-4 w-full")}>
            Edit listing
          </Link>
        </div>
      ) : !available ? (
        <div className="text-center">
          <p className="font-semibold text-ink-950">
            {listing.status === "expired" ? "This listing has expired" : isSoldOut(listing) ? "Sold out for now" : "This item has sold"}
          </p>
          <p className="mt-1 text-sm text-ink-500">
            {listing.status === "expired"
              ? `${sellerName.split(" ")[0]} can renew it if it's still available. Send a message to ask.`
              : "Save a search to hear when something similar is listed."}
          </p>
          <Link href={`/browse?category=${listing.category}`} className={buttonClass("dark", "md", "mt-4 w-full")}>
            See similar items
          </Link>
        </div>
      ) : (
        <>
          {listing.food && now !== null && (
            <p className="mb-3 flex items-center gap-2 rounded-xl bg-surface px-3.5 py-2.5 text-[13px] text-ink-700">
              <Clock className="size-4 shrink-0" aria-hidden />
              {beforeCutoff(listing.food.cutoff, now)
                ? `Order before ${formatClock(listing.food.cutoff)} for pickup today`
                : `Pre-order now for tomorrow. Same-day orders close at ${formatClock(listing.food.cutoff)}.`}
            </p>
          )}
          <button type="button" onClick={onBuy} className={buttonClass("primary", "lg", "w-full")}>
            {unitPrice < listing.price ? `Buy for ${formatCedi(unitPrice)}` : listing.food ? "Order now" : "Buy now"}
          </button>
          {actions > 0 && (
            <div className={cn("mt-2.5 grid gap-2.5", actions === 2 && "grid-cols-2")}>
              {canOffer && (
                <button
                  type="button"
                  onClick={() => setPanel(panel === "offer" ? null : "offer")}
                  className={buttonClass("outline", "lg", cn(panel === "offer" && "border-ink-950"))}
                  aria-expanded={panel === "offer"}
                  disabled={offers[listing.id]?.status === "accepted"}
                >
                  Make offer
                </button>
              )}
              {features.messaging && (
                <button
                  type="button"
                  onClick={() => setPanel(panel === "message" ? null : "message")}
                  className={buttonClass("outline", "lg", cn(panel === "message" && "border-ink-950"))}
                  aria-expanded={panel === "message"}
                >
                  <MessageCircle className="size-4" aria-hidden /> Message
                </button>
              )}
            </div>
          )}

          <AnimatePresence initial={false} mode="wait">
            {panel && (
              <motion.div
                key={panel}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                {panel === "offer" ? (
                  <OfferPanel listing={listing} sellerName={sellerName} />
                ) : (
                  <MessagePanel listing={listing} sellerName={sellerName} />
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <FeeBreakdown price={unitPrice} plan={plan} rate={config.fees.buyerProtectionRate} />
        </>
      )}

      <div className="mt-4 flex gap-3 border-t border-line pt-4">
        {plan.kind === "pickup" && !plan.optional ? (
          <Banknote className="mt-0.5 size-5 shrink-0 text-ink-700" aria-hidden />
        ) : (
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-maroon-700" aria-hidden />
        )}
        <p className="text-[13px] leading-5 text-ink-500">
          {plan.kind === "pickup" ? (
            plan.optional ? (
              <>
                <span className="font-medium text-ink-950">Pay at pickup, or add protection.</span> Pay the seller directly when you meet,
                or let Hilltop hold your payment until you confirm collection.
              </>
            ) : (
              <>
                <span className="font-medium text-ink-950">Pay at pickup.</span> Reserve it here and pay the seller with MoMo or cash when
                you meet.
              </>
            )
          ) : (
            <>
              <span className="font-medium text-ink-950">Hilltop Buyer Protection.</span> Your{" "}
              {plan.kind === "deposit" ? "deposit is" : "payment is"} held until you confirm collection
              {protection.autoReleaseHours > 0 &&
                `, or released ${protection.autoReleaseHours} hours after handover if you don't report a problem`}
              . Full refund if it isn&rsquo;t as described.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function FeeBreakdown({ price, plan, rate }: { price: number; plan: PaymentPlan; rate: number }) {
  const [open, setOpen] = useState(false);
  if (plan.kind === "pickup")
    return (
      <p className="mt-4 text-[13px] text-ink-500">
        <span className="font-medium text-ink-950 tabular">{formatCedi(price)}</span>, paid to the seller at pickup
      </p>
    );
  if (plan.kind === "deposit")
    return (
      <p className="mt-4 text-[13px] text-ink-500">
        <span className="font-medium text-ink-950 tabular">{formatCedi(plan.payNow)}</span> deposit now,{" "}
        <span className="font-medium text-ink-950 tabular">{formatCedi(plan.atPickup)}</span> at pickup
      </p>
    );
  const fee = plan.fee;
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-[13px] text-ink-500"
        aria-expanded={open}
      >
        <span>
          <span className="font-medium text-ink-950 tabular">{formatCedi(price + fee)}</span> total with buyer protection
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.dl
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden text-[13px]"
          >
            <div className="mt-3 flex justify-between text-ink-500">
              <dt>Item</dt>
              <dd className="text-ink-950 tabular">{formatCedi(price)}</dd>
            </div>
            <div className="mt-1.5 flex justify-between text-ink-500">
              <dt>Buyer protection ({percent(rate)})</dt>
              <dd className="text-ink-950 tabular">{formatCedi(fee)}</dd>
            </div>
          </motion.dl>
        )}
      </AnimatePresence>
    </div>
  );
}
