"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import { useConfig } from "@/lib/config";
import { useStore } from "@/lib/store";
import { useListings } from "@/lib/use-listings";
import { ListingRail } from "./rail";
import { buttonClass } from "./ui";

/** Product rows read through the data layer, so they include the user's own listings. */
export function HomeRails({ part }: { part: "top" | "bottom" }) {
  const { recentlyViewed, clearRecentlyViewed } = useStore();
  const { featured } = useConfig();
  const picks = useListings({ ids: featured.listingIds });
  const recent = useListings({ ids: recentlyViewed, includeSold: true });
  const trending = useListings({ sort: "popular", limit: 12 });
  const fresh = useListings({ postedWithinDays: 1, sort: "newest" });
  const food = useListings({ category: "food" });
  const accessories = useListings({ categories: ["jewellery", "eyewear", "beauty"], sort: "popular" });
  const cheap = useListings({ maxPrice: 200, sort: "price-asc" });

  if (part === "top") {
    // A brand-new marketplace: invite the first sellers instead of showing empty rows.
    if (!trending.length) {
      return (
        <section className="rounded-3xl border border-dashed border-line-strong px-6 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-maroon-50 text-maroon-700">
            <Store className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-ink-950">Nothing listed yet</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-ink-500">
            Hilltop is just opening. Be one of the first to sell: textbooks, gadgets, clothes, food, anything you no longer need.
          </p>
          <Link href="/sell" className={buttonClass("dark", "lg", "mt-6")}>
            List an item
          </Link>
        </section>
      );
    }
    return (
      <>
        {recent.length > 0 && (
          <ListingRail
            title="Pick up where you left off"
            href="/saved?tab=recent"
            listings={recent}
            action={
              <button type="button" onClick={clearRecentlyViewed} className="text-sm font-medium text-ink-500 hover:text-ink-950">
                Clear
              </button>
            }
          />
        )}
        {picks.length > 0 && <ListingRail title={featured.title} subtitle="Picked by the Hilltop team" listings={picks} />}
        <ListingRail title="Trending on campus" href="/browse?sort=popular" listings={trending} />
        <ListingRail title="Just listed" href="/browse?sort=newest" listings={fresh} />
      </>
    );
  }
  return (
    <>
      <ListingRail title="Homemade food" subtitle="Cooked and baked by students" href="/browse?category=food" listings={food} />
      <ListingRail title="Jewellery, glasses & beauty" href="/browse?category=jewellery" listings={accessories} />
      <ListingRail title="Under GH₵200" href="/browse?max=200&sort=price-asc" listings={cheap} />
    </>
  );
}
