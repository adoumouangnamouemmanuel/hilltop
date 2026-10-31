"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, Lightbulb, Plus, ThumbsUp, TriangleAlert } from "lucide-react";
import { listingStats, median, sellerInsights, sellerSummary, type ListingStats, type Period } from "@/lib/analytics";
import { useConfig } from "@/lib/config";
import { listings as seedListings } from "@/lib/data";
import { formatCedi } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { isActive } from "@/lib/model";
import { useStore } from "@/lib/store";
import { AreaChart, ColumnChart, compactNumber, Meter, Sparkline } from "@/components/charts";
import { Bone } from "@/components/skeletons";
import { buttonClass, cn } from "@/components/ui";

const periods: { id: Period; label: string }[] = [
  { id: 7, label: "7 days" },
  { id: 30, label: "30 days" },
  { id: 90, label: "90 days" },
];

const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.1 ? 1 : 0)}%`;

export function SellerDashboard() {
  const { user, myListings, orders } = useStore();
  const { features } = useConfig();
  const now = useNow();
  const [period, setPeriod] = useState<Period>(30);

  const sales = useMemo(() => orders.filter((o) => o.role === "selling"), [orders]);
  const summary = useMemo(() => (now ? sellerSummary(myListings, sales, now, period) : null), [myListings, sales, now, period]);
  const stats = useMemo(() => listingStats(myListings, sales), [myListings, sales]);
  const insights = useMemo(() => {
    const medians = new Map<string, number | null>();
    const byCategory = (id: string) => {
      if (!medians.has(id)) medians.set(id, median(seedListings.filter((l) => l.category === id).map((l) => l.price)));
      return medians.get(id) ?? null;
    };
    return sellerInsights(myListings, byCategory);
  }, [myListings]);

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-950">Log in to see your dashboard</h1>
        <Link href="/sign-in?next=/dashboard" className={buttonClass("dark", "lg", "mt-6")}>
          Continue with your student email
        </Link>
      </div>
    );
  }

  if (!features.sellerDashboard) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-950">The dashboard is coming soon</h1>
        <p className="mt-2 text-sm text-ink-500">Your sales and payouts are still on your account page.</p>
        <Link href="/me?tab=selling" className={buttonClass("dark", "md", "mt-6")}>
          Go to selling
        </Link>
      </div>
    );
  }

  const active = myListings.filter(isActive).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">Seller dashboard</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-3xl">How your listings are doing</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-surface p-1" role="radiogroup" aria-label="Period">
            {periods.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "relative rounded-lg px-3 py-1.5 text-xs font-medium sm:text-[13px]",
                  period === p.id ? "text-ink-950" : "text-ink-500 hover:text-ink-950",
                )}
              >
                {period === p.id && <motion.span layoutId="period" className="absolute inset-0 rounded-lg bg-elevated shadow-card" />}
                <span className="relative">{p.label}</span>
              </button>
            ))}
          </div>
          <Link href="/sell" className={buttonClass("dark", "md", "h-10 max-sm:hidden")}>
            <Plus className="size-4" aria-hidden /> New listing
          </Link>
        </div>
      </div>

      {!summary ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Bone key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Paid out"
              value={formatCedi(summary.totals.revenue)}
              delta={summary.deltas.revenue}
              trend={summary.series.map((p) => p.revenue)}
              hint={summary.pending ? `${formatCedi(summary.pending)} pending` : undefined}
            />
            <Stat
              label="Views"
              value={compactNumber.format(summary.totals.views)}
              delta={summary.deltas.views}
              trend={summary.series.map((p) => p.views)}
            />
            <Stat
              label="Saves"
              value={compactNumber.format(summary.totals.saves)}
              delta={summary.deltas.saves}
              trend={summary.series.map((p) => p.saves)}
            />
            <Stat
              label="Conversion"
              value={pct(summary.conversion)}
              delta={summary.deltas.conversion}
              trend={summary.series.map((p) => (p.views ? p.orders / p.views : 0))}
              hint={`${summary.totals.orders} ${summary.totals.orders === 1 ? "order" : "orders"}`}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Card title="Views" subtitle={`Across your ${active} active ${active === 1 ? "listing" : "listings"}`}>
              <AreaChart
                points={summary.series.map((p) => ({ x: p.day, y: p.views }))}
                label={`Daily listing views, last ${period} days`}
              />
            </Card>
            <Card title="Funnel" subtitle="From browsing to buying">
              <Funnel views={summary.totals.views} saves={summary.totals.saves} orders={summary.totals.orders} />
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Card title="Payouts" subtitle="Released to you when buyers confirm collection">
              <ColumnChart
                points={summary.series.map((p) => ({ x: p.day, y: p.revenue }))}
                format={(v) => `GH₵${compactNumber.format(v)}`}
                label={`Daily payouts, last ${period} days`}
              />
            </Card>
            <Card title="Suggestions" subtitle="Quick wins for more sales">
              <Insights items={insights} />
            </Card>
          </div>
        </>
      )}

      <Card title="Your listings" subtitle="Lifetime performance" className="mt-4">
        <ListingTable rows={stats} />
      </Card>
    </>
  );
}

function Card({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-line p-4 sm:p-5", className)}>
      <h2 className="text-[15px] font-semibold text-ink-950">{title}</h2>
      {subtitle && <p className="text-xs text-ink-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Stat tile: label, value, change vs the previous period, and a sparkline. */
function Stat({
  label,
  value,
  delta,
  trend,
  hint,
}: {
  label: string;
  value: string;
  delta: number | null;
  trend: number[];
  hint?: string;
}) {
  const up = delta !== null && delta > 0;
  const down = delta !== null && delta < 0;
  return (
    <motion.div layout className="rounded-2xl border border-line p-4">
      <p className="text-xs text-ink-500">{label}</p>
      <AnimatePresence mode="wait">
        <motion.p
          key={value}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-ink-950"
        >
          {value}
        </motion.p>
      </AnimatePresence>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-xs">
          {delta === null ? (
            <span className="text-ink-500">New this period</span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                up ? "text-success" : down ? "text-maroon-700" : "text-ink-500",
              )}
            >
              {up ? <ArrowUpRight className="size-3.5" aria-hidden /> : down ? <ArrowDownRight className="size-3.5" aria-hidden /> : null}
              {Math.abs(Math.round(delta * 100))}%<span className="sr-only">{up ? " up" : down ? " down" : ""}</span>
              <span className="font-normal text-ink-500"> vs before</span>
            </span>
          )}
          {hint && <span className="block text-ink-500">{hint}</span>}
        </span>
        <Sparkline values={trend} className="max-sm:hidden" />
      </div>
    </motion.div>
  );
}

function Funnel({ views, saves, orders }: { views: number; saves: number; orders: number }) {
  const steps = [
    { label: "Viewed", value: views },
    { label: "Saved", value: saves },
    { label: "Ordered", value: orders },
  ];
  return (
    <ol className="space-y-4">
      {steps.map((s, i) => (
        <li key={s.label}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-700">{s.label}</span>
            <span className="font-semibold text-ink-950 tabular">
              {compactNumber.format(s.value)}
              {i > 0 && (
                <span className="ml-1.5 text-xs font-normal text-ink-500">
                  {pct(steps[i - 1].value ? s.value / steps[i - 1].value : 0)}
                </span>
              )}
            </span>
          </div>
          <Meter value={s.value} max={views} className="mt-1.5" />
        </li>
      ))}
    </ol>
  );
}

const insightIcon = { tip: Lightbulb, warning: TriangleAlert, good: ThumbsUp };

function Insights({ items }: { items: ReturnType<typeof sellerInsights> }) {
  if (!items.length) return <p className="text-sm text-ink-500">List something to get suggestions.</p>;
  return (
    <ul className="space-y-2">
      {items.map((it, i) => {
        const Icon = insightIcon[it.tone];
        return (
          <motion.li
            key={it.id}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex gap-3 rounded-xl bg-surface p-3"
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                it.tone === "warning" ? "text-warning" : it.tone === "good" ? "text-success" : "text-ink-950",
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink-950">{it.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-ink-500">{it.body}</p>
              {it.href && (
                <Link href={it.href} className="mt-1 inline-block text-xs font-medium text-ink-950 underline underline-offset-4">
                  {it.action}
                </Link>
              )}
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}

type SortKey = "views" | "saves" | "orders" | "revenue" | "conversion";

function ListingTable({ rows }: { rows: ListingStats[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "views", dir: -1 });
  const sorted = [...rows].sort((a, b) => (a[sort.key] - b[sort.key]) * sort.dir);
  const maxViews = Math.max(1, ...rows.map((r) => r.views));
  if (!rows.length)
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-ink-500">No listings yet.</p>
        <Link href="/sell" className={buttonClass("dark", "md", "mt-4")}>
          List your first item
        </Link>
      </div>
    );

  const head = (key: SortKey, label: string) => (
    <th
      scope="col"
      className="px-3 py-2 text-right font-medium"
      aria-sort={sort.key === key ? (sort.dir === -1 ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : -1 }))}
        className="inline-flex items-center gap-0.5 hover:text-ink-950"
      >
        {label}
        {sort.key === key && (sort.dir === -1 ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />)}
      </button>
    </th>
  );

  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="text-left text-xs text-ink-500">
          <tr className="border-b border-line">
            <th scope="col" className="px-4 py-2 font-medium sm:px-3">
              Listing
            </th>
            {head("views", "Views")}
            {head("saves", "Saves")}
            {head("orders", "Orders")}
            {head("conversion", "Conversion")}
            {head("revenue", "Paid out")}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((r) => (
            <motion.tr key={r.listing.id} layout className="align-middle">
              <td className="px-4 py-3 sm:px-3">
                <Link href={`/listing/${r.listing.id}`} className="flex items-center gap-3">
                  <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-surface">
                    <Image
                      src={r.listing.images[0]}
                      alt=""
                      fill
                      sizes="40px"
                      unoptimized={r.listing.images[0].startsWith("data:")}
                      className="object-cover"
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-[220px] truncate font-medium text-ink-950 hover:underline">{r.listing.title}</span>
                    <span className="text-xs text-ink-500">
                      {formatCedi(r.listing.price)} · {isActive(r.listing) ? "Active" : "Sold"}
                    </span>
                  </span>
                </Link>
              </td>
              <td className="px-3 py-3 text-right tabular">
                <span className="text-ink-950">{compactNumber.format(r.views)}</span>
                <Meter value={r.views} max={maxViews} className="mt-1 ml-auto w-16" />
              </td>
              <td className="px-3 py-3 text-right text-ink-950 tabular">{r.saves}</td>
              <td className="px-3 py-3 text-right text-ink-950 tabular">{r.orders}</td>
              <td className="px-3 py-3 text-right text-ink-950 tabular">{pct(r.conversion)}</td>
              <td className="px-3 py-3 text-right font-medium text-ink-950 tabular">{formatCedi(r.revenue)}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
