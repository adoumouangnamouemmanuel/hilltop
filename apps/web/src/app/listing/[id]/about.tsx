import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import type { Listing, Seller } from "@/lib/data";
import { firstName, formatClock } from "@/lib/format";
import { sellerStats } from "@/lib/model";
import { useLiveSeller } from "@/lib/use-seller";
import type { Review } from "@/lib/types";
import { Avatar, buttonClass, Rating, Verified } from "@/components/ui";

export function About({ listing, facts }: { listing: Listing; facts: [string, string][] }) {
  return (
    <div className="space-y-10 lg:mt-12">
      <section>
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-950">About this item</h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 [overflow-wrap:anywhere] whitespace-pre-line text-ink-700">
          {listing.description}
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-950">Details</h2>
        <dl className="mt-3 max-w-2xl divide-y divide-line border-y border-line">
          {facts.map(([k, v]) => (
            <div
              key={k}
              className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-3 py-3 text-sm xs:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] xs:gap-4"
            >
              <dt className="text-ink-500">{k}</dt>
              <dd className="[overflow-wrap:anywhere] text-ink-950">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      {listing.food && (
        <section className="max-w-2xl rounded-2xl border border-line p-5">
          <div className="flex gap-3">
            <Clock className="mt-0.5 size-5 shrink-0 text-ink-950" aria-hidden />
            <div>
              <h2 className="text-sm font-semibold text-ink-950">How ordering works</h2>
              <p className="mt-1 text-sm leading-6 text-ink-500">
                Same-day orders close at {formatClock(listing.food.cutoff)}. After that, your order is for the next day. Pickup windows:{" "}
                {listing.food.slots.join(", ")}.
              </p>
            </div>
          </div>
        </section>
      )}
      <section className="max-w-2xl rounded-2xl bg-surface p-5">
        <div className="flex gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-ink-950" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold [overflow-wrap:anywhere] text-ink-950">Meet at {listing.pickup}</h2>
            <p className="mt-1 text-sm leading-6 text-ink-500">
              Check the item in person before you confirm. Only confirm collection once you&rsquo;re happy, and never pay outside Hilltop.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export function SellerCard({ seller: cached, isMe, extraReviews }: { seller: Seller; isMe: boolean; extraReviews: Review[] }) {
  const seller = useLiveSeller(cached);
  const stats = sellerStats(seller, extraReviews);
  const about = seller.specialty || (seller.major ? `${seller.major}${seller.classOf ? ` · Class of ${seller.classOf}` : ""}` : "");
  return (
    <div className="mt-4 rounded-2xl border border-line p-5">
      <div className="flex items-start gap-3.5">
        <Avatar name={seller.name} size={48} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-semibold text-ink-950">
            <span className="min-w-0 [overflow-wrap:anywhere]">{seller.name}</span>
            {seller.verified && <Verified />}
          </p>
          {seller.shop && <p className="text-[13px] font-medium [overflow-wrap:anywhere] text-ink-700">{seller.shop}</p>}
          {about && <p className="line-clamp-2 text-[13px] [overflow-wrap:anywhere] text-ink-500">{about}</p>}
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-xl bg-surface py-3 text-center">
        <div>
          <dt className="sr-only">Rating</dt>
          <dd className="text-sm">
            <Rating value={stats.rating} />
          </dd>
          <dd className="mt-0.5 text-[11px] text-ink-500">{stats.reviews} reviews</dd>
        </div>
        <div>
          <dt className="sr-only">Sold</dt>
          <dd className="text-sm font-medium text-ink-950 tabular">{seller.sales}</dd>
          <dd className="mt-0.5 text-[11px] text-ink-500">items sold</dd>
        </div>
        {seller.responseTime ? (
          <div className="px-1">
            <dt className="sr-only">Usually replies</dt>
            <dd className="text-sm font-medium text-ink-950">{seller.responseTime.replace("within ", "")}</dd>
            <dd className="mt-0.5 text-[11px] text-ink-500">to reply</dd>
          </div>
        ) : (
          <div className="px-1">
            <dt className="sr-only">Joined</dt>
            <dd className="text-sm font-medium text-ink-950 tabular">{seller.joined}</dd>
            <dd className="mt-0.5 text-[11px] text-ink-500">joined</dd>
          </div>
        )}
      </dl>
      {!isMe && (
        <Link href={`/seller/${seller.id}`} className={buttonClass("ghost", "md", "mt-3 w-full")}>
          View {firstName(seller.name)}&rsquo;s profile
        </Link>
      )}
    </div>
  );
}
