"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { formatCedi } from "@/lib/format";
import { useStore } from "@/lib/store";
import { ListingCard } from "@/components/listing-card";
import { buttonClass } from "@/components/ui";

export function SavedView() {
  const { saved, allListings } = useStore();
  const items = allListings.filter((l) => saved.includes(l.id));
  const total = items.reduce((sum, l) => sum + l.price, 0);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-3xl">Saved items</h1>
      <p className="mt-1.5 text-sm text-ink-500">
        {items.length
          ? `${items.length} ${items.length === 1 ? "item" : "items"}, ${formatCedi(total)} in total`
          : "Tap the heart on any listing to keep it here."}
      </p>

      {items.length ? (
        <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-5">
          {items.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
          <Heart className="mx-auto size-8 text-ink-300" aria-hidden />
          <p className="mt-4 font-semibold text-ink-950">Nothing saved yet</p>
          <p className="mt-1 text-sm text-ink-500">Save items to compare them later or get back to them quickly.</p>
          <Link href="/browse" className={buttonClass("dark", "md", "mt-6")}>
            Browse items
          </Link>
        </div>
      )}
    </>
  );
}
