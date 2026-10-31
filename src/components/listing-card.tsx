"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Heart } from "lucide-react";
import type { Listing } from "@/lib/data";
import { discountPercent, formatCedi } from "@/lib/format";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn } from "./ui";

// Attribute keys worth surfacing on a card, most informative first.
const SPEC_KEYS = ["storage", "ram", "model", "type", "material", "size", "portion", "availability", "network", "subject"];

function cardSpec(l: Listing) {
  const a = l.attributes ?? {};
  const parts: string[] = [];
  for (const k of SPEC_KEYS) {
    const v = a[k];
    if (typeof v === "string" && v && v !== "Other" && !l.title.toLowerCase().includes(v.toLowerCase())) parts.push(v);
    if (parts.length === 2) break;
  }
  return parts;
}

export function ListingCard({
  listing,
  priority = false,
  sizes = "(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw",
}: {
  listing: Listing;
  priority?: boolean;
  sizes?: string;
}) {
  const { saved, toggleSaved } = useStore();
  const isSaved = saved.includes(listing.id);
  const off = discountPercent(listing.price, listing.originalPrice);
  const [first, second] = listing.images;
  const spec = cardSpec(listing);
  const meta = [listing.condition, ...spec].filter(Boolean).slice(0, 2).join(" · ");

  function save() {
    toggleSaved(listing.id);
    if (!isSaved) toast("Saved to your list", { tone: "saved", action: { label: "View", href: "/saved" } });
  }

  return (
    <motion.article whileTap={{ scale: 0.98 }} transition={{ type: "spring", stiffness: 600, damping: 30 }} className="group relative">
      <Link href={`/listing/${listing.id}`} className="block rounded-xl">
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-surface">
          <Image
            src={first}
            alt={listing.title}
            fill
            priority={priority}
            sizes={sizes}
            className={cn("object-cover transition duration-500 ease-out", second ? "md:group-hover:opacity-0" : "group-hover:scale-[1.04]")}
          />
          {second && (
            <Image src={second} alt="" fill sizes={sizes} className="hidden object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100 md:block" />
          )}
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
            {off >= 15 && <Tag>{off}% off</Tag>}
            {listing.moveOut && <Tag tone="maroon">Move-Out</Tag>}
          </div>
          {listing.images.length > 1 && (
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {listing.images.map((src, i) => (
                <span key={src} className={cn("size-1.5 rounded-full bg-white shadow", i === 0 ? "opacity-100" : "opacity-50")} />
              ))}
            </div>
          )}
          {listing.stock !== undefined && listing.stock <= 12 && (
            <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">{listing.stock} left</span>
          )}
        </div>
        <div className="mt-2.5 space-y-0.5 px-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tabular text-ink-950">{formatCedi(listing.price)}</span>
            {off > 0 && <span className="text-xs tabular text-ink-400 line-through">{formatCedi(listing.originalPrice!)}</span>}
          </div>
          <h3 className="truncate text-[13px] text-ink-700">{listing.title}</h3>
          <p className="truncate text-xs text-ink-400">
            {meta || listing.pickup}
            {listing.promoted && <span> · Promoted</span>}
          </p>
        </div>
      </Link>
      <button
        type="button"
        onClick={save}
        aria-label={isSaved ? `Remove ${listing.title} from saved` : `Save ${listing.title}`}
        aria-pressed={isSaved}
        className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-elevated/95 text-ink-900 shadow-[0_1px_3px_rgb(0_0_0/0.15)] backdrop-blur transition-transform active:scale-90"
      >
        <AnimatePresence>
          {isSaved && (
            <motion.span
              key="burst"
              className="absolute inset-0 rounded-full border-2 border-maroon-600"
              initial={{ scale: 0.6, opacity: 1 }}
              animate={{ scale: 1.8, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            />
          )}
        </AnimatePresence>
        <motion.span key={String(isSaved)} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 14 }}>
          <Heart className={cn("size-4", isSaved && "fill-maroon-700 text-maroon-700")} strokeWidth={2} aria-hidden />
        </motion.span>
      </button>
    </motion.article>
  );
}

function Tag({ children, tone = "light" }: { children: React.ReactNode; tone?: "light" | "maroon" }) {
  return (
    <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", tone === "light" ? "bg-white text-[#121010]" : "bg-maroon-700 text-white")}>
      {children}
    </span>
  );
}

export function ListingCardSkeleton() {
  return (
    <div aria-hidden>
      <div className="aspect-[4/5] animate-shimmer rounded-xl bg-[linear-gradient(90deg,var(--surface)_0%,var(--surface-2)_50%,var(--surface)_100%)] bg-[length:200%_100%]" />
      <div className="mt-3 h-4 w-1/3 rounded bg-surface" />
      <div className="mt-2 h-3 w-3/4 rounded bg-surface" />
    </div>
  );
}
