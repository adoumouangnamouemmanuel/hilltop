import type { Metadata } from "next";
import Image from "next/image";
import campusGardens from "@/assets/campus/campus-gardens.jpg";
import { getListings } from "@/lib/api";
import { notFound } from "next/navigation";
import { dateRange, percent } from "@hilltop/shared/config";
import { protectionSummary } from "@hilltop/shared/payments";
import { getPlatformConfig } from "@/lib/config-server";
import { formatCedi } from "@/lib/format";
import { Countdown } from "@/components/countdown";
import { ListingCard } from "@/components/listing-card";
import { ButtonLink, SectionHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getPlatformConfig()).events.moveOut.name };
}

export default async function MoveOutPage() {
  const config = await getPlatformConfig();
  const sale = config.events.moveOut;
  if (!sale.enabled) notFound();
  const items = await getListings({ moveOut: true });
  const value = items.reduce((sum, l) => sum + l.price, 0);

  return (
    <div className="container-page space-y-16 pt-6 sm:pt-8">
      <section className="relative isolate overflow-hidden rounded-2xl bg-maroon-800 text-white">
        <Image
          src={campusGardens}
          alt=""
          fill
          priority
          placeholder="blur"
          sizes="(min-width: 82rem) 80rem, 100vw"
          className="-z-10 animate-ken-burns object-cover"
        />
        {/* Keeps the text readable over the photo while letting the campus show through. */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-maroon-900/95 via-maroon-800/80 to-maroon-800/40" aria-hidden />
        <div className="grid gap-10 p-6 sm:p-10 lg:grid-cols-[1.3fr_1fr] lg:items-end lg:p-14">
          <div>
            <p className="text-sm font-medium text-white/70">{dateRange(sale.startsAt, sale.endsAt, true)}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">{sale.name}</h1>
            <p className="mt-4 max-w-lg text-[15px] leading-7 text-white/75">
              One week where everyone moving out of the hostels lists in one place. Graduates get paid, freshers get set up for less, and
              nothing ends up in a skip.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <ButtonLink href="/sell" variant="white" size="lg">
                List your items
              </ButtonLink>
              <ButtonLink href="/browse?sale=1" variant="glass" size="lg">
                Shop early listings
              </ButtonLink>
            </div>
          </div>
          <div>
            <p className="mb-3 text-sm text-white/70">Sale starts in</p>
            <Countdown to={sale.startsAt} />
          </div>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 bg-black/25 backdrop-blur-sm">
          {[
            [String(items.length), "items listed so far"],
            [formatCedi(value), "worth of student gear"],
            ["Free", `to list, ${percent(config.fees.buyerProtectionRate)} buyer fee`],
          ].map(([v, l]) => (
            <div key={l} className="px-6 py-5 sm:px-10">
              <dt className="text-lg font-semibold tabular sm:text-2xl">{v}</dt>
              <dd className="text-xs text-white/60 sm:text-sm">{l}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-8 sm:grid-cols-3">
        {[
          ["List before you pack", "Add your items now and they go live to everyone the moment the sale opens."],
          ["Buyers come to your hostel", `Pick a pickup spot. ${protectionSummary(config)}`],
          ["Leave with cash, not clutter", "Get paid at pickup, or as soon as the buyer confirms a protected order."],
        ].map(([title, body]) => (
          <div key={title} className="border-t border-ink-950 pt-5">
            <h2 className="font-semibold text-ink-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-500">{body}</p>
          </div>
        ))}
      </section>

      <section>
        <SectionHeader title="Already in the sale" subtitle="Early listings you can buy today" href="/browse?sale=1" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-5">
          {items.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      </section>
    </div>
  );
}
