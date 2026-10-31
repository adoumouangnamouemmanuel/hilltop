"use client";

import type { Seller } from "@/lib/data";
import { firstName } from "@/lib/format";
import { sellerStats } from "@/lib/model";
import { useStore } from "@/lib/store";
import { useListings } from "@/lib/use-listings";
import { RelativeTime, Stars } from "@/components/controls";
import { ListingCard } from "@/components/listing-card";
import { Avatar, Rating } from "@/components/ui";

/*
 * The live parts of a seller page: listings and reviews that change as the user
 * buys and reviews. The profile itself is rendered on the server.
 */

type PlatformReview = { id: string; author: string; rating: number; text: string; when: string };

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
      <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4">
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
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-ink-950">
          <Avatar name={author} size={28} /> {author}
        </span>
        <span className="text-xs text-ink-500">{when}</span>
      </div>
      <div className="mt-2">
        <Stars value={rating} size={13} />
      </div>
      {text && <p className="mt-1.5 text-sm leading-6 text-ink-700">{text}</p>}
    </li>
  );
}
