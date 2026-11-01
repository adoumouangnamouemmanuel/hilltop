import { Suspense } from "react";
import type { Metadata } from "next";
import { getListing, getSeller } from "@/lib/api";
import { getMarket } from "@/lib/market-server";
import { baseCategories, findCategory } from "@/lib/catalog";
import { formatCedi } from "@/lib/format";
import { ListingDetail } from "./listing-detail";

// Listings are regenerated every minute; new ones render on first visit.
export const revalidate = 60;

export async function generateStaticParams() {
  return (await getMarket()).listings.map((l) => ({ id: l.id }));
}

export async function generateMetadata({ params }: PageProps<"/listing/[id]">): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) return { title: "Listing" };
  const description = `${formatCedi(listing.price)} · ${listing.condition ? `${listing.condition} · ` : ""}${listing.description}`.slice(
    0,
    160,
  );
  return {
    title: listing.title,
    description,
    openGraph: {
      title: `${listing.title} · ${formatCedi(listing.price)}`,
      description,
      images: listing.images.slice(0, 1).map((url) => ({ url, alt: listing.title })),
      type: "website",
    },
    twitter: { card: "summary_large_image", title: listing.title, description, images: listing.images.slice(0, 1) },
  };
}

/** schema.org Product data so search engines can show price and availability. */
async function ProductJsonLd({ id }: { id: string }) {
  const listing = await getListing(id);
  if (!listing) return null;
  const seller = await getSeller(listing.sellerId);
  const json = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: listing.description,
    image: listing.images,
    category: findCategory(baseCategories, listing.category).label,
    brand: typeof listing.attributes?.brand === "string" ? { "@type": "Brand", name: listing.attributes.brand } : undefined,
    offers: {
      "@type": "Offer",
      price: listing.price,
      priceCurrency: "GHS",
      itemCondition: listing.condition === "New" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
      availability: (listing.status ?? "active") === "active" ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      seller: seller ? { "@type": "Person", name: seller.name } : undefined,
    },
  };
  // Escape "<" so listing text can't close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, "\\u003c") }} />;
}

async function Detail({ params }: { params: PageProps<"/listing/[id]">["params"] }) {
  const { id } = await params;
  const initial = await getListing(id);
  return (
    <>
      <ProductJsonLd id={id} />
      <ListingDetail id={id} initial={initial} />
    </>
  );
}

export default function ListingPage({ params }: PageProps<"/listing/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-[70vh] max-w-6xl" />}>
      <Detail params={params} />
    </Suspense>
  );
}
