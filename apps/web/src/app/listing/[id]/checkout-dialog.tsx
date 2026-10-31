"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, CreditCard, Loader2, Lock, MapPin, Minus, Plus, Smartphone } from "lucide-react";
import type { Listing } from "@/lib/data";
import { beforeCutoff, formatCedi, formatClock, protectionFee } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { useConfig } from "@/lib/config";
import { useStore } from "@/lib/store";
import { enabledPaymentMethods } from "@hilltop/shared/config";
import type { Order } from "@/lib/types";
import { Confetti } from "@/components/confetti";
import { Sheet } from "@/components/sheet";
import { buttonClass, cn } from "@/components/ui";

const methodIcons = { momo: Smartphone, card: CreditCard };

const meetSlots = ["Today, 4 to 6pm", "Tomorrow, 12 to 2pm", "Tomorrow, 5 to 7pm"];

type Step = "review" | "paying" | "done";

/** Pickup windows: food uses the seller's slots and cut-off, everything else offers meet-up times. */
export function pickupOptions(listing: Listing, now: number | null, foodOrdering = true) {
  if (!listing.food || !foodOrdering) return { slots: meetSlots, sameDay: true };
  const sameDay = now === null || beforeCutoff(listing.food.cutoff, now);
  const day = sameDay ? "Today" : "Tomorrow";
  return { slots: listing.food.slots.map((s) => `${day}, ${s}`), sameDay };
}

export function CheckoutDialog({
  open,
  onClose,
  listing,
  unitPrice,
}: {
  open: boolean;
  onClose: () => void;
  listing: Listing;
  unitPrice: number;
}) {
  const { user, placeOrder } = useStore();
  const config = useConfig();
  const methods = enabledPaymentMethods(config);
  const now = useNow();
  const [step, setStep] = useState<Step>("review");
  const [chosenMethod, setMethod] = useState<string | null>(null);
  const method = chosenMethod && methods.some((m) => m.id === chosenMethod) ? chosenMethod : methods[0]?.id;
  const { slots, sameDay } = pickupOptions(listing, now, config.features.foodOrdering);
  const [slot, setSlot] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [order, setOrder] = useState<Order | null>(null);

  const maxQty = Math.max(1, Math.min(listing.stock ?? 1, 10));
  const subtotal = unitPrice * qty;
  const fee = protectionFee(subtotal, config.fees.buyerProtectionRate);
  const total = subtotal + fee;
  const chosenSlot = slot ?? slots[0];

  function pay() {
    setStep("paying");
    // Simulated payment provider round-trip.
    setTimeout(() => {
      setOrder(placeOrder({ listing, quantity: qty, unitPrice, fee, slot: chosenSlot }));
      setStep("done");
    }, 1400);
  }

  function close() {
    onClose();
    setTimeout(() => {
      setStep("review");
      setQty(1);
    }, 300);
  }

  const title = !user ? "Log in to buy" : step === "done" ? "Order placed" : "Checkout";

  return (
    <Sheet open={open} onClose={close} title={title} dismissable={step !== "paying"}>
      <AnimatePresence mode="wait" initial={false}>
        {!user ? (
          <Pane key="auth">
            <p className="text-sm leading-6 text-ink-500">
              Hilltop is for verified Ashesi students only. Log in with your school email to buy with protection.
            </p>
            <Link href={`/sign-in?next=/listing/${listing.id}`} className={buttonClass("dark", "lg", "mt-5 w-full")}>
              Continue with Ashesi email
            </Link>
          </Pane>
        ) : step === "done" && order ? (
          <Pane key="done" className="pb-2 text-center">
            <span className="relative mx-auto mt-2 grid size-16 place-items-center">
              <Confetti count={14} spread={56} delay={0.2} size={6} />
              <motion.span
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 18 }}
                className="relative grid size-14 place-items-center rounded-full bg-success-bg text-success"
              >
                <Check className="size-7" strokeWidth={2.5} aria-hidden />
              </motion.span>
            </span>
            <p className="mt-4 text-xl font-semibold tracking-[-0.02em] text-ink-950">
              {formatCedi(order.amount + order.fee)} is held safely
            </p>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-ink-500">
              Meet at <span className="font-medium text-ink-950">{listing.pickup}</span>, {order.slot?.toLowerCase()}. Confirm collection
              once you have it and the seller gets paid.
            </p>
            <Link href="/me" onClick={close} className={buttonClass("dark", "lg", "mt-6 w-full")}>
              View order
            </Link>
            <button type="button" onClick={close} className="mt-2 h-11 w-full text-sm font-medium text-ink-700 hover:text-ink-950">
              Keep browsing
            </button>
          </Pane>
        ) : (
          <Pane key="review">
            <div className="flex items-center gap-3">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface">
                <Image src={listing.images[0]} alt="" fill sizes="64px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-950">{listing.title}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                  <MapPin className="size-3.5" aria-hidden /> {listing.pickup}
                </p>
                {unitPrice < listing.price && (
                  <p className="mt-0.5 text-xs font-medium text-success">Your accepted offer: {formatCedi(unitPrice)}</p>
                )}
              </div>
            </div>

            {listing.stock !== undefined && listing.stock > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-950">
                  Quantity <span className="font-normal text-ink-400">({listing.stock} available)</span>
                </span>
                <div className="flex items-center gap-1 rounded-xl border border-line-strong p-1">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1 || step === "paying"}
                    className="grid size-8 place-items-center rounded-lg hover:bg-surface disabled:opacity-30"
                    aria-label="Fewer"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold tabular" aria-live="polite">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                    disabled={qty >= maxQty || step === "paying"}
                    className="grid size-8 place-items-center rounded-lg hover:bg-surface disabled:opacity-30"
                    aria-label="More"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
            )}

            <fieldset className="mt-6" disabled={step === "paying"}>
              <legend className="text-sm font-semibold text-ink-950">{listing.food ? "Pickup time" : "Meet-up time"}</legend>
              {listing.food && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
                  <Clock className="size-3.5" aria-hidden />
                  {sameDay
                    ? `Order before ${formatClock(listing.food.cutoff)} for today`
                    : `Today's orders closed at ${formatClock(listing.food.cutoff)}. This is a pre-order for tomorrow.`}
                </p>
              )}
              <div className="-mx-5 mt-2.5 no-scrollbar flex gap-2 overflow-x-auto px-5">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlot(s)}
                    aria-pressed={chosenSlot === s}
                    className={cn(
                      "shrink-0 rounded-lg border px-3 py-2 text-xs transition-colors",
                      chosenSlot === s ? "border-ink-950 bg-ink-950 text-canvas" : "border-line-strong text-ink-700 hover:border-ink-900",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-6" disabled={step === "paying"}>
              <legend className="text-sm font-semibold text-ink-950">Payment method</legend>
              <div className="mt-2.5 divide-y divide-line overflow-hidden rounded-xl border border-line">
                {methods.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 px-4 py-3.5 text-sm hover:bg-surface">
                    <input
                      type="radio"
                      name="method"
                      value={m.id}
                      checked={method === m.id}
                      onChange={() => setMethod(m.id)}
                      className="peer sr-only"
                    />
                    {(() => {
                      const Icon = methodIcons[m.kind];
                      return <Icon className="size-[18px] text-ink-500" aria-hidden />;
                    })()}
                    <span className="flex-1 text-ink-900">{m.label}</span>
                    <span
                      className={cn(
                        "grid size-5 place-items-center rounded-full border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-maroon-600 peer-focus-visible:ring-offset-2",
                        method === m.id ? "border-ink-950" : "border-line-strong",
                      )}
                    >
                      {method === m.id && <span className="size-2.5 rounded-full bg-ink-950" />}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <dl className="mt-6 space-y-2 text-sm">
              <div className="flex justify-between text-ink-500">
                <dt>Item{qty > 1 && ` x ${qty}`}</dt>
                <dd className="text-ink-950 tabular">{formatCedi(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-ink-500">
                <dt>Buyer protection</dt>
                <dd className="text-ink-950 tabular">{formatCedi(fee)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-base font-semibold text-ink-950">
                <dt>Total</dt>
                <dd className="tabular">{formatCedi(total)}</dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={pay}
              disabled={step === "paying"}
              className={buttonClass("primary", "lg", "mt-5 w-full disabled:bg-maroon-700")}
            >
              {step === "paying" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Processing payment
                </>
              ) : (
                <>
                  <Lock className="size-4" aria-hidden /> Pay {formatCedi(total)}
                </>
              )}
            </button>
            <p className="mt-3 text-center text-xs text-ink-500">Demo checkout. No real payment is taken.</p>
          </Pane>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

function Pane({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
