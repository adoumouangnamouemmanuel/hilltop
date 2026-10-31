import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { listings, MOVE_OUT_SALE } from "@/lib/data";
import { popularSearches } from "@/lib/search";
import { Countdown } from "@/components/countdown";
import { ActivityTicker, CategoryGrid, RotatingWord } from "@/components/home-bits";
import { HowItWorks } from "@/components/how-it-works";
import { ListingRail } from "@/components/rail";
import { SearchBox } from "@/components/search-box";

export default function Home() {
  const trending = [...listings].sort((a, b) => Number(!!b.promoted) - Number(!!a.promoted) || b.saves - a.saves).slice(0, 12);
  const fresh = listings.filter((l) => l.postedDaysAgo <= 1);
  const food = listings.filter((l) => l.category === "food");
  const accessories = listings.filter((l) => ["jewellery", "eyewear", "beauty"].includes(l.category));
  const cheap = listings.filter((l) => l.price <= 200).sort((a, b) => a.price - b.price);
  const saleCovers = listings.filter((l) => l.moveOut).slice(0, 3);

  return (
    <div className="space-y-16 pb-8 sm:space-y-20">
      {/* Hero with the animated guide */}
      <section className="container-page grid items-center gap-12 pt-6 sm:pt-10 lg:grid-cols-[1.15fr_1fr] lg:gap-6 lg:pt-14">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-700">
            <BadgeCheck className="size-3.5 text-maroon-700" aria-hidden /> Only for @ashesi.edu.gh
          </span>
          <h1 className="mt-5 text-[38px] font-semibold leading-[1.08] tracking-[-0.04em] text-ink-950 sm:text-6xl">
            Buy and sell
            <br />
            <RotatingWord />
            <br />
            on campus, safely.
          </h1>
          <div className="mt-8 max-w-xl">
            <Suspense fallback={<div className="h-14 rounded-2xl bg-surface" />}>
              <SearchBox large />
            </Suspense>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-400">Trending</span>
            {popularSearches.slice(0, 5).map((s) => (
              <Link
                key={s}
                href={`/browse?q=${encodeURIComponent(s)}`}
                className="rounded-full border border-line px-3 py-1 text-xs text-ink-700 transition-colors hover:border-ink-950 hover:text-ink-950"
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
        <HowItWorks />
      </section>

      <section className="container-page">
        <CategoryGrid />
      </section>

      <section>
        <ActivityTicker />
      </section>

      <div className="container-page space-y-16 sm:space-y-20">
        <ListingRail title="Trending on campus" href="/browse?sort=popular" listings={trending} />
        <ListingRail title="Just listed" href="/browse?sort=newest" listings={fresh} />

        {/* Move-Out Sale */}
        <Link href="/move-out" className="group relative block overflow-hidden rounded-3xl bg-maroon-800 text-white">
          <div className="grid items-center gap-6 p-6 sm:p-10 md:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm text-white/70">4 to 12 December</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{MOVE_OUT_SALE.name}</h2>
              <div className="mt-5 flex items-center gap-3">
                <Countdown to={MOVE_OUT_SALE.startsAt} variant="inline" className="text-lg font-semibold" />
                <span className="grid size-9 place-items-center rounded-full bg-white text-maroon-800 transition-transform group-hover:translate-x-1">
                  <ArrowRight className="size-4" aria-hidden />
                </span>
              </div>
            </div>
            <div className="flex -space-x-6">
              {saleCovers.map((l, i) => (
                <span
                  key={l.id}
                  style={{ rotate: `${(i - 1) * 6}deg` }}
                  className="relative size-24 overflow-hidden rounded-2xl border-4 border-maroon-800 transition-transform duration-500 group-hover:translate-y-[-4px] sm:size-32"
                >
                  <Image src={l.images[0]} alt="" fill sizes="128px" className="object-cover" />
                </span>
              ))}
            </div>
          </div>
        </Link>

        <ListingRail title="Homemade food" subtitle="Cooked and baked by students" href="/browse?category=food" listings={food} />
        <ListingRail title="Jewellery, glasses & beauty" href="/browse?category=jewellery" listings={accessories} />
        <ListingRail title="Under GH₵200" href="/browse?max=200&sort=price-asc" listings={cheap} />

        {/* Sell CTA */}
        <Link
          href="/sell"
          className="group flex flex-col items-start justify-between gap-6 rounded-3xl border border-line p-6 transition-colors hover:border-ink-950 sm:flex-row sm:items-center sm:p-10"
        >
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-ink-950 sm:text-3xl">Sell something today.</h2>
            <p className="mt-1 text-sm text-ink-500">Free to list. Paid when they collect.</p>
          </div>
          <span className="inline-flex h-12 items-center gap-2 rounded-xl bg-ink-950 px-6 text-[15px] font-medium text-canvas">
            Start selling <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </span>
        </Link>
      </div>
    </div>
  );
}
