import type { Metadata } from "next";
import { Suspense } from "react";
import { ListingCardSkeleton } from "@/components/listing-card";
import { BrowseView } from "./browse-view";

export const metadata: Metadata = { title: "Browse" };

export default function BrowsePage() {
  return (
    <Suspense fallback={<BrowseSkeleton />}>
      <BrowseView />
    </Suspense>
  );
}

function BrowseSkeleton() {
  return (
    <div className="container-page pt-8">
      <div className="h-8 w-48 rounded-lg bg-surface" />
      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
