"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Lock, MapPin, Plus } from "lucide-react";
import { getListing, getSeller } from "@/lib/data";
import { formatCedi } from "@/lib/format";
import { useStore, type Order } from "@/lib/store";
import { ListingCard } from "@/components/listing-card";
import { OrderTimeline } from "@/components/order-timeline";
import { Avatar, buttonClass, cn, Verified } from "@/components/ui";

const tabs = { purchases: "Purchases", selling: "Selling" } as const;
type Tab = keyof typeof tabs;

export function MyMarket() {
  const router = useRouter();
  const pathname = usePathname();
  const tabParam = useSearchParams().get("tab");
  const tab: Tab = tabParam === "selling" ? "selling" : "purchases";
  const { user, orders, myListings } = useStore();

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-950">Log in to see your account</h1>
        <p className="mt-2 text-sm text-ink-500">Your purchases, listings and payment holds live here.</p>
        <Link href="/sign-in?next=/me" className={buttonClass("dark", "lg", "mt-6")}>
          Continue with Ashesi email
        </Link>
      </div>
    );
  }

  const held = orders.filter((o) => o.status === "held");
  const heldTotal = held.reduce((sum, o) => sum + o.amount + o.fee, 0);

  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar name={user.name} size={64} />
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.025em] text-ink-950">
            {user.name}
            <Verified />
          </h1>
          <p className="truncate text-sm text-ink-500">{user.email}</p>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-3 divide-x divide-line rounded-2xl border border-line">
        <Stat label="Held for you" value={formatCedi(heldTotal)} />
        <Stat label="Awaiting pickup" value={String(held.length)} />
        <Stat label="Listed items" value={String(myListings.length)} />
      </dl>

      <div className="mt-10 flex gap-6 border-b border-line" role="tablist">
        {(Object.keys(tabs) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => router.replace(t === "purchases" ? pathname : `${pathname}?tab=${t}`, { scroll: false })}
            className={cn("relative pb-3 text-sm font-medium transition-colors", tab === t ? "text-ink-950" : "text-ink-500 hover:text-ink-950")}
          >
            {tabs[t]}
            {tab === t && <motion.span layoutId="me-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink-950" />}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="mt-6">
          {tab === "purchases" ? (
            orders.length ? (
              <ul className="space-y-3">
                {orders.map((o) => (
                  <OrderCard key={o.id} order={o} />
                ))}
              </ul>
            ) : (
              <Empty title="No purchases yet" body="Everything you buy shows up here with its payment status." cta="Browse items" href="/browse" />
            )
          ) : myListings.length ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
              <Link href="/sell" className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-sm font-medium text-ink-700 hover:border-ink-900 hover:text-ink-950">
                <Plus className="size-5" aria-hidden /> New listing
              </Link>
              {myListings.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          ) : (
            <Empty title="You haven't listed anything" body="Take a photo, set a price and you're live in under a minute." cta="List an item" href="/sell" />
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function OrderCard({ order }: { order: Order }) {
  const { confirmCollection, allListings } = useStore();
  const [confirming, setConfirming] = useState(false);
  const listing = allListings.find((l) => l.id === order.listingId) ?? getListing(order.listingId);
  if (!listing) return null;
  const seller = getSeller(listing.sellerId);
  const released = order.status === "released";

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
              </Link>
              <p className="mt-0.5 text-xs text-ink-500">
                Order {order.id.replace("ord-", "#")} · {order.placedLabel}
                {seller && <> · {seller.name}</>}
              </p>
            </div>
            <p className="shrink-0 text-[15px] font-semibold tabular text-ink-950">{formatCedi(order.amount + order.fee)}</p>
          </div>
          <span
            className={cn(
              "mt-2 inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold",
              released ? "bg-success-bg text-success" : "bg-warning-bg text-warning",
            )}
          >
            {released ? "Completed" : "Awaiting pickup"}
          </span>
        </div>
      </div>

      <div className="mt-5 sm:pl-24">
        <OrderTimeline reached={released ? 4 : 2} />
      </div>

      <AnimatePresence initial={false}>
        {!released && (
          <motion.div initial={false} exit={{ height: 0, opacity: 0, marginTop: 0 }} className="mt-5 overflow-hidden">
            <div className="flex flex-col gap-3 rounded-xl bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-xs text-ink-700">
                <p className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-ink-500" aria-hidden /> Meet at {listing.pickup}
                </p>
                <p className="flex items-center gap-1.5">
                  <Lock className="size-3.5 text-ink-500" aria-hidden /> Payment held until you confirm
                </p>
              </div>
              {confirming ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirming(false)} className={buttonClass("outline", "sm")}>
                    Cancel
                  </button>
                  <button type="button" onClick={() => confirmCollection(order.id)} className={buttonClass("dark", "sm")}>
                    <Check className="size-3.5" aria-hidden /> Yes, release payment
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" className={buttonClass("ghost", "sm")}>
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
    </motion.li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-4 sm:px-6">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular tracking-[-0.01em] text-ink-950 sm:text-xl">{value}</dd>
    </div>
  );
}

function Empty({ title, body, cta, href }: { title: string; body: string; cta: string; href: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="font-semibold text-ink-950">{title}</p>
      <p className="mt-1 text-sm text-ink-500">{body}</p>
      <Link href={href} className={buttonClass("dark", "md", "mt-5")}>
        {cta}
      </Link>
    </div>
  );
}
