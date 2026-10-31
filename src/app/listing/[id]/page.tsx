import { Suspense } from "react";
import type { Metadata } from "next";
import { getListing, listings } from "@/lib/data";
import { ListingDetail } from "./listing-detail";

export function generateStaticParams() {
  return listings.map((l) => ({ id: l.id }));
}

export async function generateMetadata({ params }: PageProps<"/listing/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: getListing(id)?.title ?? "Listing" };
}

export default function ListingPage({ params }: PageProps<"/listing/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-[70vh] max-w-6xl" />}>
      <ListingDetail params={params} />
    </Suspense>
  );
}
