import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSeller, getSellerReviews } from "@/lib/api";
import { getMarket } from "@/lib/market-server";
import { SellerHeader, SellerListings, SellerReviews } from "./seller-live";

export const revalidate = 60;

// The most active sellers are built ahead; the rest render on first visit.
export async function generateStaticParams() {
  return (await getMarket()).sellers
    .toSorted((a, b) => b.sales - a.sales)
    .slice(0, 100)
    .map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/seller/[id]">): Promise<Metadata> {
  const { id } = await params;
  const seller = await getSeller(id);
  return seller
    ? {
        title: seller.name,
        description:
          `${seller.shop ? `${seller.shop} by ` : ""}${seller.name}${seller.specialty ? `: ${seller.specialty.toLowerCase()}` : ""} on Hilltop. ${seller.reviews ? `${seller.sales} items sold, rated ${seller.rating}.` : ""}`.trim(),
      }
    : { title: "Seller" };
}

export default async function SellerPage({ params }: PageProps<"/seller/[id]">) {
  const { id } = await params;
  const seller = await getSeller(id);
  if (!seller) notFound();
  const reviews = await getSellerReviews(seller);

  return (
    <div className="container-page pt-6 sm:pt-8">
      <nav className="text-xs text-ink-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-ink-950">
          Home
        </Link>
        <span className="mx-1.5 text-ink-300">/</span>
        <span className="break-words text-ink-950">{seller.name}</span>
      </nav>

      <SellerHeader seller={seller} />

      <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-16">
        <SellerListings sellerId={seller.id} />
        <SellerReviews seller={seller} reviews={reviews} />
      </div>
    </div>
  );
}
