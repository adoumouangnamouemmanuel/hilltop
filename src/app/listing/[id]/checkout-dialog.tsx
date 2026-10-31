"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CreditCard, Loader2, Lock, MapPin, Smartphone, X } from "lucide-react";
import type { Listing } from "@/lib/data";
import { formatCedi } from "@/lib/format";
import { useStore, type Order } from "@/lib/store";
import { buttonClass, cn } from "@/components/ui";

const methods = [
  { id: "mtn", label: "MTN Mobile Money", icon: Smartphone },
  { id: "telecel", label: "Telecel Cash", icon: Smartphone },
  { id: "card", label: "Debit or credit card", icon: CreditCard },
] as const;

const slots = ["Today, 4 to 6pm", "Tomorrow, 12 to 2pm", "Tomorrow, 5 to 7pm"];

type Step = "review" | "paying" | "done";

export function CheckoutDialog({ open, onClose, listing, fee }: { open: boolean; onClose: () => void; listing: Listing; fee: number }) {
  const { user, placeOrder } = useStore();
  const [step, setStep] = useState<Step>("review");
  const [method, setMethod] = useState<(typeof methods)[number]["id"]>("mtn");
  const [slot, setSlot] = useState(slots[0]);
  const [order, setOrder] = useState<Order | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && step !== "paying" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, step, onClose]);

  function pay() {
    setStep("paying");
    // Simulated payment provider round-trip.
    setTimeout(() => {
      setOrder(placeOrder(listing, fee));
      setStep("done");
    }, 1400);
  }

  function close() {
    onClose();
    setTimeout(() => setStep("review"), 300);
  }

  const total = listing.price + fee;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => step !== "paying" && close()}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 32 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className="relative flex max-h-[92vh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-2xl bg-elevated shadow-pop sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 id="checkout-title" className="text-base font-semibold text-ink-950">
                {!user ? "Log in to buy" : step === "done" ? "Order placed" : "Checkout"}
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                disabled={step === "paying"}
                aria-label="Close"
                className="grid size-8 place-items-center rounded-full text-ink-500 hover:bg-surface hover:text-ink-950 disabled:opacity-40"
              >
                <X className="size-[18px]" />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
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
                  <Pane key="done" className="text-center">
                    <motion.span
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 320, damping: 18 }}
                      className="mx-auto grid size-14 place-items-center rounded-full bg-success-bg text-success"
                    >
                      <Check className="size-7" strokeWidth={2.5} aria-hidden />
                    </motion.span>
                    <p className="mt-4 text-xl font-semibold tracking-[-0.02em] text-ink-950">
                      {formatCedi(order.amount + order.fee)} is held safely
                    </p>
                    <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-ink-500">
                      Meet at <span className="font-medium text-ink-950">{listing.pickup}</span>, {slot.toLowerCase()}. Confirm collection
                      once you have the item and the seller gets paid.
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
                      </div>
                    </div>

                    <fieldset className="mt-6" disabled={step === "paying"}>
                      <legend className="text-sm font-semibold text-ink-950">Meet-up time</legend>
                      <div className="-mx-5 mt-2.5 no-scrollbar flex gap-2 overflow-x-auto px-5">
                        {slots.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSlot(s)}
                            aria-pressed={slot === s}
                            className={cn(
                              "shrink-0 rounded-lg border px-3 py-2 text-xs transition-colors",
                              slot === s ? "border-ink-950 bg-ink-950 text-canvas" : "border-line-strong text-ink-700 hover:border-ink-900",
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
                          <label key={m.id} className="flex cursor-pointer items-center gap-3 px-4 py-3.5 text-sm hover:bg-surface">
                            <input
                              type="radio"
                              name="method"
                              value={m.id}
                              checked={method === m.id}
                              onChange={() => setMethod(m.id)}
                              className="peer sr-only"
                            />
                            <m.icon className="size-[18px] text-ink-500" aria-hidden />
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
                        <dt>Item</dt>
                        <dd className="text-ink-950 tabular">{formatCedi(listing.price)}</dd>
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
                    <p className="mt-3 text-center text-xs text-ink-400">Demo checkout. No real payment is taken.</p>
                  </Pane>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
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
