import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, GraduationCap, Package } from "lucide-react";
import { getSeller, getSellerReviews } from "@/lib/api";
import { getMarket } from "@/lib/market-server";
import { Avatar, Verified } from "@/components/ui";
import { SellerListings, SellerRating, SellerReviews } from "./seller-live";

export const revalidate = 60;

export async function generateStaticParams() {
  return (await getMarket()).sellers.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/seller/[id]">): Promise<Metadata> {
  const { id } = await params;
  const seller = await getSeller(id);
  return seller
    ? {
        title: seller.name,
        description:
          `${seller.shop ? `${seller.shop} by ` : ""}${seller.name}: ${seller.specialty.toLowerCase()} on Hilltop. ${seller.reviews ? `${seller.sales} items sold, rated ${seller.rating}.` : ""}`.trim(),
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
        <span className="text-ink-950">{seller.name}</span>
      </nav>

      <header className="mt-5 flex flex-col gap-6 border-b border-line pb-8 sm:flex-row sm:items-center">
        <Avatar name={seller.name} size={88} />
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-3xl">
            {seller.name}
            {seller.verified && <Verified className="[&_svg]:size-5" />}
          </h1>
          <p className="mt-1 text-[15px] text-ink-700">
            {seller.shop && <span className="font-semibold text-ink-950">{seller.shop} · </span>}
            {seller.specialty}
          </p>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <SellerRating seller={seller} />
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-500">
            {seller.major && (
              <li className="flex items-center gap-1.5">
                <GraduationCap className="size-4" aria-hidden /> {seller.major}
                {seller.classOf && `, class of ${seller.classOf}`}
              </li>
            )}
            <li className="flex items-center gap-1.5">
              <Package className="size-4" aria-hidden /> {seller.sales} items sold
            </li>
            <li className="flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden /> Replies {seller.responseTime}
            </li>
            <li className="flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden /> On Hilltop since {seller.joined}
            </li>
          </ul>
        </div>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_320px]">
        <SellerListings sellerId={seller.id} />
        <SellerReviews seller={seller} reviews={reviews} />
      </div>
    </div>
  );
}
