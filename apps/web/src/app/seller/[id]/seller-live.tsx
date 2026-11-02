"use client";

import { CalendarDays, Clock, GraduationCap, Package, Store } from "lucide-react";
import type { Seller } from "@/lib/data";
import { firstName } from "@/lib/format";
import { sellerStats } from "@/lib/model";
import { useStore } from "@/lib/store";
import { useListings } from "@/lib/use-listings";
import { useLiveSeller } from "@/lib/use-seller";
import { RelativeTime, Stars } from "@/components/controls";
import { ListingCard } from "@/components/listing-card";
import { Avatar, Rating, Verified } from "@/components/ui";

/*
 * The live parts of a seller page: listings and reviews that change as the user
 * buys and reviews. The profile itself is rendered on the server.
 */

type PlatformReview = { id: string; author: string; rating: number; text: string; when: string };

/** Name, shop, what they sell and how fast they reply, read fresh so profile edits show at once. */
export function SellerHeader({ seller: cached }: { seller: Seller }) {
  const seller = useLiveSeller(cached);
  return (
    <header className="mt-5 flex flex-col gap-5 border-b border-line pb-8 sm:flex-row sm:items-center sm:gap-6">
      <Avatar name={seller.name} size={88} />
      <div className="min-w-0 flex-1">
        <h1 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xl font-semibold tracking-[-0.025em] break-words text-ink-950 sm:text-3xl">
          <span className="min-w-0 [overflow-wrap:anywhere]">{seller.name}</span>
          {seller.verified && <Verified className="[&_svg]:size-5" />}
        </h1>
        {seller.shop && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[15px] font-semibold text-ink-950">
            <Store className="size-4 shrink-0 text-ink-500" aria-hidden />
            <span className="min-w-0 [overflow-wrap:anywhere]">{seller.shop}</span>
          </p>
        )}
        {seller.specialty && <p className="mt-1 text-[15px] [overflow-wrap:anywhere] text-ink-700">{seller.specialty}</p>}
        <div className="mt-2 flex items-center gap-2 text-sm">
          <SellerRating seller={seller} />
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-500">
          {seller.major && (
            <li className="flex items-center gap-1.5">
              <GraduationCap className="size-4 shrink-0" aria-hidden /> {seller.major}
              {seller.classOf && `, class of ${seller.classOf}`}
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <Package className="size-4 shrink-0" aria-hidden /> {seller.sales} items sold
          </li>
          {seller.responseTime && (
            <li className="flex items-center gap-1.5">
              <Clock className="size-4 shrink-0" aria-hidden /> Usually replies {seller.responseTime}
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <CalendarDays className="size-4 shrink-0" aria-hidden /> On Hilltop since {seller.joined}
          </li>
        </ul>
      </div>
    </header>
  );
}

export function SellerRating({ seller }: { seller: Seller }) {
  const { reviews } = useStore();
  const stats = sellerStats(
    seller,
    reviews.filter((r) => r.sellerId === seller.id),
  );
  return <Rating value={stats.rating} count={stats.reviews} />;
}

export function SellerListings({ sellerId }: { sellerId: string }) {
  const items = useListings({ sellerId, includeSold: true });
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-950">
        Listings <span className="font-normal text-ink-500">{items.length}</span>
      </h2>
      <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 xl:grid-cols-4 3xl:grid-cols-5">
        {items.map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </div>
    </section>
  );
}

export function SellerReviews({ seller, reviews }: { seller: Seller; reviews: PlatformReview[] }) {
  const { reviews: mine } = useStore();
  const own = mine.filter((r) => r.sellerId === seller.id);
  const total = sellerStats(seller, own).reviews;

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-950">
        Reviews <span className="font-normal text-ink-500">{total}</span>
      </h2>
      <ul className="mt-5 divide-y divide-line">
        {own.map((r) => (
          <ReviewItem
            key={r.id}
            author={`${r.author} (you)`}
            rating={r.rating}
            text={[r.tags.join(", "), r.text].filter(Boolean).join(". ")}
            when={<RelativeTime at={r.at} />}
          />
        ))}
        {reviews.map((r) => (
          <ReviewItem key={r.id} author={r.author} rating={r.rating} text={r.text} when={r.when} />
        ))}
      </ul>
      {own.length + reviews.length === 0 && (
        <p className="mt-4 text-sm text-ink-500">No written reviews for {firstName(seller.name)} yet.</p>
      )}
    </section>
  );
}

function ReviewItem({ author, rating, text, when }: { author: string; rating: number; text: string; when: React.ReactNode }) {
  return (
    <li className="py-4 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink-950">
          <Avatar name={author} size={28} /> <span className="truncate">{author}</span>
        </span>
        <span className="shrink-0 text-xs text-ink-500">{when}</span>
      </div>
      <div className="mt-2">
        <Stars value={rating} size={13} />
      </div>
      {text && <p className="mt-1.5 text-sm leading-6 [overflow-wrap:anywhere] text-ink-700">{text}</p>}
    </li>
  );
}
