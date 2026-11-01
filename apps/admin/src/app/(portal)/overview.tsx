"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  Coins,
  Flag,
  Gavel,
  Receipt,
  Rocket,
  Users,
  Wallet,
} from "lucide-react";
import { diffConfig } from "@hilltop/shared/config";
import { formatCedi } from "@hilltop/shared/format";
import { AreaChart, Meter } from "@hilltop/ui/charts";
import { RelativeTime } from "@hilltop/ui/controls";
import { CategoryIcon } from "@hilltop/ui/category-icon";
import { cn } from "@hilltop/ui/ui";
import { Card, CardHeader, Gate, PageHeader, Segmented, Stat } from "@/components/kit";
import { byCategory, disputeDue, overview, type Period } from "@/lib/metrics";
import { useAdmin, usePublished, useSession } from "@/lib/store";

export function Overview() {
  return (
    <Gate permission="dashboard.view">
      <OverviewInner />
    </Gate>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span>No earlier data</span>;
  const up = value >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-success" : "text-maroon-700")}>
      {up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
      {Math.abs(Math.round(value * 100))}%<span className="ml-1 font-normal text-ink-500">vs previous period</span>
    </span>
  );
}

function OverviewInner() {
  const s = useAdmin();
  const { member } = useSession();
  const { config } = usePublished();
  const [period, setPeriod] = useState<Period>(30);
  // Captured once so the numbers don't shift while the page is open.
  const [now] = useState(() => Date.now());

  const data = useMemo(() => overview(s.orders, now, period, config), [s.orders, now, period, config]);
  const categories = useMemo(() => byCategory(s.orders, now, period).slice(0, 6), [s.orders, now, period]);
  const label = (id: string) => config.categories.find((c) => c.id === id);
  const icon = (id: string) => label(id)?.icon ?? "Package";

  const openDisputes = s.disputes.filter((d) => d.state === "open");
  const overdue = openDisputes.filter((d) => disputeDue(d.openedAt, config.disputes.responseHours) < now).length;
  const reported = s.listings.filter((l) => l.reports.length && l.state === "live");
  const unverified = s.users.filter((u) => !u.verified && u.status === "active");
  const draftChanges = s.draft ? diffConfig(config, s.draft).length : 0;
  const held = s.orders
    .filter((o) => o.payment !== "pickup" && (o.status === "paid" || o.status === "ready" || o.status === "disputed"))
    .reduce((n, o) => n + o.paidInApp - o.fee, 0);

  const queues = [
    {
      href: "/disputes",
      icon: Gavel,
      label: "Open disputes",
      count: openDisputes.length,
      note: overdue ? `${overdue} past the ${config.disputes.responseHours}h target` : "All within target",
      warn: overdue > 0,
    },
    {
      href: "/listings?view=reported",
      icon: Flag,
      label: "Reported listings",
      count: reported.length,
      note: "Waiting for review",
      warn: reported.length > 0,
    },
    {
      href: "/users?view=unverified",
      icon: BadgeCheck,
      label: "Unverified students",
      count: unverified.length,
      note: "Can browse but not sell",
    },
    {
      href: "/publish",
      icon: Rocket,
      label: "Unpublished changes",
      count: draftChanges,
      note: draftChanges ? "Not live yet" : "Everything is live",
      warn: draftChanges > 0,
    },
  ];

  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader title={`${greeting}, ${member?.name.split(" ")[0]}`} description={`Here's how ${config.brand.name} is doing.`}>
        <Segmented
          label="Period"
          value={String(period) as "7" | "30" | "90"}
          onChange={(v) => setPeriod(Number(v) as Period)}
          options={[
            { id: "7", label: "7 days" },
            { id: "30", label: "30 days" },
            { id: "90", label: "90 days" },
          ]}
        />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales volume" icon={Coins} value={formatCedi(data.current.gmv)} sub={<Delta value={data.deltas.gmv} />} />
        <Stat
          label="Platform revenue"
          icon={Wallet}
          tone="maroon"
          value={formatCedi(Math.round(data.current.revenue))}
          sub={<Delta value={data.deltas.revenue} />}
        />
        <Stat label="Orders" icon={Receipt} value={data.current.orders.toLocaleString()} sub={<Delta value={data.deltas.orders} />} />
        <Stat
          label="Active students"
          icon={Users}
          value={data.current.activeUsers.toLocaleString()}
          sub={<Delta value={data.deltas.activeUsers} />}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Sales volume"
            description={`Per day, excluding refunds. ${formatCedi(held)} is held in protection right now.`}
          />
          <div className="p-4 sm:p-5">
            <AreaChart points={data.series} label="Sales volume per day" format={(v) => formatCedi(Math.round(v))} height={260} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Needs attention" description="Queues across the team" />
          <ul className="divide-y divide-line">
            {queues.map((q, i) => (
              <motion.li key={q.href} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <Link href={q.href} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface">
                  <span
                    className={cn(
                      "grid size-9 place-items-center rounded-xl",
                      q.warn ? "bg-warning-bg text-warning" : "bg-surface text-ink-700",
                    )}
                  >
                    <q.icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-ink-950">{q.label}</span>
                    <span className={cn("block text-xs", q.warn ? "text-warning" : "text-ink-500")}>{q.note}</span>
                  </span>
                  <span className="text-lg font-semibold text-ink-950 tabular">{q.count}</span>
                  <ChevronRight className="size-4 text-ink-300 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </motion.li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top categories" description="By sales volume in this period" />
          {categories.length ? (
            <ul className="space-y-4 p-5">
              {categories.map((c) => (
                <li key={c.category} className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-ink-700">
                    <CategoryIcon name={icon(c.category)} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="truncate font-medium text-ink-900">{label(c.category)?.label ?? c.category}</span>
                      <span className="text-ink-700 tabular">{formatCedi(c.gmv)}</span>
                    </div>
                    <Meter value={c.gmv} max={categories[0].gmv} className="mt-1.5" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-5 text-sm text-ink-500">No sales in this period.</p>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent admin activity">
            <Link
              href="/audit"
              className="text-[13px] font-medium text-ink-700 underline decoration-line-strong underline-offset-4 hover:text-ink-950"
            >
              Audit log
            </Link>
          </CardHeader>
          <ul className="divide-y divide-line">
            {s.audit.slice(0, 6).map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-300" aria-hidden />
                <p className="min-w-0 flex-1 text-[13px] text-ink-700">
                  <span className="font-medium text-ink-950">{a.actor}</span> {a.action.toLowerCase()}
                  {a.target && <span className="text-ink-500"> · {a.target}</span>}
                </p>
                <RelativeTime at={a.at} className="shrink-0 text-xs text-ink-400" />
              </li>
            ))}
          </ul>
          {overdue > 0 && (
            <div className="m-4 flex items-center gap-2 rounded-xl bg-warning-bg px-3 py-2.5 text-[13px] text-warning">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {overdue} dispute{overdue > 1 ? "s are" : " is"} past the response target.
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
