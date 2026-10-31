"use client";

import { useStore } from "@/lib/store";
import { useListings } from "@/lib/use-listings";
import { ListingRail } from "./rail";

/** Product rows read through the data layer, so they include the user's own listings. */
export function HomeRails({ part }: { part: "top" | "bottom" }) {
  const { recentlyViewed } = useStore();
  const recent = useListings({ ids: recentlyViewed, includeSold: true });
  const trending = useListings({ sort: "popular", limit: 12 });
  const fresh = useListings({ postedWithinDays: 1, sort: "newest" });
  const food = useListings({ category: "food" });
  const accessories = useListings({ categories: ["jewellery", "eyewear", "beauty"], sort: "popular" });
  const cheap = useListings({ maxPrice: 200, sort: "price-asc" });

  if (part === "top") {
    return (
      <>
        {recent.length > 0 && <ListingRail title="Pick up where you left off" href="/saved?tab=recent" listings={recent} />}
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
