"use client";

import { GuideTip } from "@/components/buy-guide";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Eye, Heart, Share } from "lucide-react";
import type { Listing } from "@/lib/data";
import { discountPercent, firstName, formatCedi, postedLabel } from "@/lib/format";
import { isActive, isSoldOut } from "@/lib/model";
import { factsFor, sellerFor, specsFor } from "@/lib/specs";
import { useConfig } from "@/lib/config";
import { findListing, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useCatalog } from "@/lib/use-catalog";
import { useListings } from "@/lib/use-listings";
import { CategoryIcon } from "@/components/category-icon";
import { ListingRail } from "@/components/rail";
import { buttonClass, cn } from "@/components/ui";
import { About, SellerCard } from "./about";
import { BuyBox, type Panel } from "./buy-box";
import { ReportListing } from "./report-sheet";
import { paymentPlan } from "@hilltop/shared/payments";
import { CheckoutDialog } from "./checkout-dialog";
import { Gallery } from "./gallery";

/**
 * `initial` is the server-rendered listing (platform listings). Listings the user created
 * only exist in their browser in the mock, so those are looked up client-side.
 */
export function ListingDetail({ id, initial }: { id: string; initial: Listing | null }) {
  const { allListings, saved, toggleSaved, user, offers, reviews, recordView } = useStore();
  const config = useConfig();
  const { features } = config;
  const catalog = useCatalog();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [copied, setCopied] = useState(false);

  const found = findListing(allListings, id);
  // The browser's copy of the market has shortened descriptions; the server sent this one in full.
  const listing = found && initial?.id === found.id ? { ...found, description: initial.description } : (found ?? initial);
  const visible = listing && (listing.status !== "draft" || (!!user?.handle && listing.sellerId === user.handle));

  useEffect(() => {
    if (visible) recordView(id);
  }, [id, visible, recordView]);

  const fromSeller = useListings({ sellerId: listing?.sellerId, limit: 12 }).filter((l) => l.id !== id);
  const similar = useListings({ category: listing?.category, sort: "popular", limit: 13 }).filter(
    (l) => l.id !== id && l.sellerId !== listing?.sellerId,
  );

  if (!listing || !visible) return <NotFound />;

  const seller = sellerFor(listing, user);
  const category = catalog.get(listing.category);
  const specs = specsFor(listing, category);
  const highlights = specs.filter((s) => s.highlight).slice(0, 4);
  const off = discountPercent(listing.price, listing.originalPrice);
  const isSaved = saved.includes(listing.id);
  const offer = offers[listing.id];
  const unitPrice = offer?.status === "accepted" ? offer.amount : listing.price;
  const plan = paymentPlan(config, { total: unitPrice, category: listing.category, preorder: !!listing.food && features.foodOrdering });
  const mobilePayLine =
    plan.kind === "protected"
      ? `+ ${formatCedi(plan.fee)} buyer protection`
      : plan.kind === "deposit"
        ? `${formatCedi(plan.payNow)} deposit, rest at pickup`
        : "Pay the seller at pickup";
  const available = isActive(listing) && !isSoldOut(listing);

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: listing!.title, url: window.location.href });
      else {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        toast("Link copied");
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {}
  }

  return (
    <div className="container-page pt-4 sm:pt-6">
      <nav className="hidden text-xs text-ink-500 sm:block" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-ink-950">
          Home
        </Link>
        <span className="mx-1.5 text-ink-300">/</span>
        <Link href={`/browse?category=${category.id}`} className="hover:text-ink-950">
          {category.label}
        </Link>
        <span className="mx-1.5 text-ink-300">/</span>
        <span className="[overflow-wrap:anywhere] text-ink-950">{listing.title}</span>
      </nav>

      {listing.status === "draft" && (
        <p className="mt-4 rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning">
          This is a draft. Only you can see it until you publish.
        </p>
      )}

      <div className="grid grid-cols-1 gap-8 sm:mt-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-12">
        <div className="relative min-w-0">
          <Gallery images={listing.images} title={listing.title} />
          {!available && (
            <span className="absolute top-4 left-4 z-30 rounded-lg bg-ink-950 px-3 py-1.5 text-sm font-semibold text-canvas sm:left-4">
              {isSoldOut(listing) ? "Sold out" : "Sold"}
            </span>
          )}
          <div className="hidden lg:block">
            <About listing={listing} facts={factsFor(listing, category)} />
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-[132px] lg:self-start">
          <div className="flex items-start justify-between gap-3 xs:gap-4">
            <h1 className="min-w-0 text-xl leading-snug font-semibold tracking-[-0.02em] [overflow-wrap:anywhere] text-ink-950 xs:text-[22px] sm:text-2xl">
              {listing.title}
            </h1>
            <div className="flex shrink-0 gap-1">
              <IconButton label={copied ? "Link copied" : "Share"} onClick={share}>
                {copied ? <Check className="size-[18px]" /> : <Share className="size-[18px]" />}
              </IconButton>
              <IconButton
                label={isSaved ? "Remove from saved" : "Save"}
                pressed={isSaved}
                onClick={() => {
                  const result = toggleSaved(listing.id);
                  if (result === "sign-in")
                    toast("Log in to save items", { action: { label: "Log in", href: `/sign-in?next=/listing/${listing.id}` } });
                  else if (result === "saved") toast("Saved to your list", { tone: "saved", action: { label: "View", href: "/saved" } });
                }}
              >
                <Heart className={cn("size-[18px]", isSaved && "fill-maroon-700 text-maroon-700")} />
              </IconButton>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-2xl font-semibold tracking-[-0.02em] text-ink-950 tabular xs:text-[28px]">
              {formatCedi(listing.price)}
            </span>
            {off > 0 && (
              <>
                <span className="text-sm text-ink-400 tabular line-through">{formatCedi(listing.originalPrice!)}</span>
                <span className="text-sm font-medium text-maroon-700">{off}% below retail</span>
              </>
            )}
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-500">
            <Link
              href={`/browse?category=${category.id}`}
              className="inline-flex items-center gap-1 font-medium text-ink-950 hover:underline"
            >
              <CategoryIcon name={category.icon} className="size-3.5" /> {category.label}
            </Link>
            {listing.condition && (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium text-ink-950">{listing.condition}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>Listed {postedLabel(listing.postedDaysAgo).toLowerCase()}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3.5" aria-hidden /> {listing.views} views
            </span>
          </p>

          {highlights.length > 0 && (
            <dl className="mt-5 grid grid-cols-2 gap-2">
              {highlights.map((h, i) => (
                <motion.div
                  key={h.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  className="rounded-xl bg-surface px-3.5 py-2.5"
                >
                  <dt className="text-[11px] text-ink-500">{h.label}</dt>
                  <dd className="truncate text-sm font-medium text-ink-950">{h.value}</dd>
                </motion.div>
              ))}
            </dl>
          )}

          {!seller.isMe && (
            <div className="mt-6 empty:hidden">
              <GuideTip where="listing" />
            </div>
          )}
          <BuyBox
            listing={listing}
            sellerName={seller.name}
            isOwn={seller.isMe}
            unitPrice={unitPrice}
            panel={panel}
            setPanel={setPanel}
            onBuy={() => setCheckoutOpen(true)}
          />
          <SellerCard seller={seller} isMe={seller.isMe} extraReviews={reviews.filter((r) => r.sellerId === seller.id)} />
          {!seller.isMe && <ReportListing listingId={listing.id} title={listing.title} />}
        </div>

        <div className="min-w-0 lg:hidden">
          <About listing={listing} facts={factsFor(listing, category)} />
        </div>
      </div>

      <div className="mt-16 space-y-16">
        <ListingRail
          title={`More from ${firstName(seller.name)}`}
          href={seller.isMe ? undefined : `/seller/${seller.id}`}
          listings={fromSeller}
        />
        <ListingRail title="Similar items" href={`/browse?category=${category.id}`} listings={similar.slice(0, 12)} />
      </div>

      {/* Mobile buy bar */}
      {!seller.isMe && available && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-line bg-elevated px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] xs:gap-3 xs:px-4 md:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-lg leading-tight font-semibold text-ink-950 tabular">{formatCedi(unitPrice)}</p>
            <p className="truncate text-[11px] text-ink-500">{mobilePayLine}</p>
          </div>
          {features.offers && !listing.food && (
            <button
              type="button"
              onClick={() => {
                setPanel("offer");
                document.getElementById("buy-box")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={buttonClass("outline", "md", "shrink-0 max-xs:px-3")}
            >
              Offer
            </button>
          )}
          <button type="button" onClick={() => setCheckoutOpen(true)} className={buttonClass("primary", "md", "shrink-0 max-xs:px-3")}>
            {listing.food ? "Order" : "Buy now"}
          </button>
        </div>
      )}

      <CheckoutDialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} listing={listing} unitPrice={unitPrice} />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className="grid size-10 place-items-center rounded-full border border-line text-ink-900 transition-colors hover:border-ink-900"
    >
      {children}
    </button>
  );
}

function NotFound() {
  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">This item is no longer available</h1>
      <p className="mt-2 text-ink-500">It may have sold or been removed by the seller.</p>
      <Link href="/browse" className={buttonClass("dark", "md", "mt-6")}>
        Keep browsing
      </Link>
    </div>
  );
}
