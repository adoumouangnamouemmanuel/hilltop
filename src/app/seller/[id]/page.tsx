import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, GraduationCap, Package } from "lucide-react";
import { getSeller, listings, reviews, sellers } from "@/lib/data";
import { firstName } from "@/lib/format";
import { ListingCard } from "@/components/listing-card";
import { Avatar, Rating, Verified } from "@/components/ui";

export function generateStaticParams() {
  return sellers.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/seller/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: getSeller(id)?.name ?? "Seller" };
}

export default async function SellerPage({ params }: PageProps<"/seller/[id]">) {
  const { id } = await params;
  const seller = getSeller(id);
  if (!seller) notFound();

  const items = listings.filter((l) => l.sellerId === seller.id);
  const sellerReviews = reviews.filter((r) => r.sellerId === seller.id);

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
            <Verified className="[&_svg]:size-5" />
          </h1>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <Rating value={seller.rating} count={seller.reviews} />
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-500">
            <li className="flex items-center gap-1.5">
              <GraduationCap className="size-4" aria-hidden /> {seller.major}, class of {seller.classOf}
            </li>
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
        <section>
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-950">
            Listings <span className="font-normal text-ink-400">{items.length}</span>
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4">
            {items.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-950">
            Reviews <span className="font-normal text-ink-400">{seller.reviews}</span>
          </h2>
          <ul className="mt-5 divide-y divide-line">
            {sellerReviews.map((r) => (
              <li key={r.id} className="py-4 first:pt-0">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-ink-950">
                    <Avatar name={r.author} size={28} /> {r.author}
                  </span>
                  <span className="text-xs text-ink-400">{r.when}</span>
                </div>
                <p className="mt-2 flex gap-0.5 text-xs text-ink-950" aria-label={`${r.rating} out of 5`}>
                  {"★★★★★".slice(0, r.rating)}
                  <span className="text-ink-300">{"★★★★★".slice(r.rating)}</span>
                </p>
                <p className="mt-1.5 text-sm leading-6 text-ink-700">{r.text}</p>
              </li>
            ))}
          </ul>
          {sellerReviews.length === 0 && <p className="mt-4 text-sm text-ink-500">No written reviews for {firstName(seller.name)} yet.</p>}
        </section>
      </div>
    </div>
  );
}
