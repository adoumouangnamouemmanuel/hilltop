"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChartNoAxesColumn } from "lucide-react";
import { formatCedi } from "@/lib/format";
import { payoutState } from "@/lib/model";
import { useConfig } from "@/lib/config";
import { resetDemo, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Order } from "@/lib/types";
import { PushPrompt } from "@/components/notifications";
import { ThemeSegmented } from "@/components/theme-toggle";
import { Avatar, buttonClass, cn, Verified } from "@/components/ui";
import { ListingsManager } from "./listings-manager";
import { OrderCard } from "./order-card";
import { DisputeSheet, ReviewSheet } from "./order-sheets";

const tabs = { purchases: "Purchases", selling: "Selling", settings: "Settings" } as const;
type Tab = keyof typeof tabs;

export function MyMarket() {
  const router = useRouter();
  const pathname = usePathname();
  const tabParam = useSearchParams().get("tab");
  const tab: Tab = tabParam === "selling" || tabParam === "settings" ? tabParam : "purchases";
  const { user, orders } = useStore();
  const { features } = useConfig();
  const [reporting, setReporting] = useState<Order | null>(null);
  const [reviewing, setReviewing] = useState<Order | null>(null);

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-950">Log in to see your account</h1>
        <p className="mt-2 text-sm text-ink-500">Your purchases, sales and payment holds live here.</p>
        <Link href="/sign-in?next=/me" className={buttonClass("dark", "lg", "mt-6")}>
          Continue with Ashesi email
        </Link>
      </div>
    );
  }

  const buying = orders.filter((o) => o.role === "buying");
  const selling = orders.filter((o) => o.role === "selling");
  const sum = (list: Order[], fn: (o: Order) => number) => list.reduce((n, o) => n + fn(o), 0);

  const stats =
    tab === "selling"
      ? [
          {
            label: "Pending payout",
            value: formatCedi(
              sum(
                selling.filter((o) => payoutState(o) === "held"),
                (o) => o.amount,
              ),
            ),
          },
          {
            label: "Paid out",
            value: formatCedi(
              sum(
                selling.filter((o) => payoutState(o) === "released"),
                (o) => o.amount,
              ),
            ),
          },
          { label: "To prepare", value: String(selling.filter((o) => o.status === "paid").length) },
        ]
      : [
          {
            label: "Held for you",
            value: formatCedi(
              sum(
                buying.filter((o) => payoutState(o) === "held"),
                (o) => o.amount + o.fee,
              ),
            ),
          },
          { label: "Awaiting pickup", value: String(buying.filter((o) => o.status === "paid" || o.status === "ready").length) },
          { label: "Completed", value: String(buying.filter((o) => o.status === "collected").length) },
        ];

  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar name={user.name} size={64} />
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.025em] text-ink-950">
            {user.name}
            <Verified />
          </h1>
          <p className="truncate text-sm text-ink-500">{user.email}</p>
        </div>
      </div>

      <div className="mt-8 flex gap-6 border-b border-line" role="tablist">
        {(Object.keys(tabs) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => router.replace(t === "purchases" ? pathname : `${pathname}?tab=${t}`, { scroll: false })}
            className={cn(
              "relative pb-3 text-sm font-medium transition-colors",
              tab === t ? "text-ink-950" : "text-ink-500 hover:text-ink-950",
            )}
          >
            {tabs[t]}
            {t === "selling" && selling.some((o) => o.status === "paid") && (
              <span className="ml-1.5 inline-block size-1.5 rounded-full bg-maroon-700 align-middle" aria-label="Needs attention" />
            )}
            {tab === t && <motion.span layoutId="me-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink-950" />}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="mt-6"
        >
          {tab !== "settings" && (
            <dl className="mb-8 grid grid-cols-3 divide-x divide-line rounded-2xl border border-line">
              {stats.map((s) => (
                <div key={s.label} className="px-4 py-4 sm:px-6">
                  <dt className="text-xs text-ink-500">{s.label}</dt>
                  <dd className="mt-1 text-lg font-semibold tracking-[-0.01em] text-ink-950 tabular sm:text-xl">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {tab === "purchases" &&
            (buying.length ? (
              <ul className="space-y-3">
                {buying.map((o) => (
                  <OrderCard key={o.id} order={o} onReport={setReporting} onReview={setReviewing} />
                ))}
              </ul>
            ) : (
              <Empty
                title="No purchases yet"
                body="Everything you buy shows up here with its payment status."
                cta="Browse items"
                href="/browse"
              />
            ))}

          {tab === "selling" && (
            <div className="space-y-12">
              {features.sellerDashboard && (
                <Link
                  href="/dashboard"
                  className="group -mt-4 flex items-center gap-4 rounded-2xl bg-ink-950 p-4 text-canvas transition-transform hover:-translate-y-0.5 sm:p-5"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-canvas/10">
                    <ChartNoAxesColumn className="size-5" aria-hidden />
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">Seller dashboard</span>
                    <span className="text-[13px] opacity-70">Views, conversion, payouts and tips to sell faster</span>
                  </span>
                  <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
                </Link>
              )}
              <section>
                <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-950">Sales</h2>
                {selling.length ? (
                  <ul className="mt-4 space-y-3">
                    {selling.map((o) => (
                      <OrderCard key={o.id} order={o} onReport={setReporting} onReview={setReviewing} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-ink-500">When someone buys from you, the order shows up here.</p>
                )}
              </section>
              <ListingsManager />
            </div>
          )}

          {tab === "settings" && (
            <div className="max-w-xl space-y-8">
              <section>
                <h2 className="text-sm font-semibold text-ink-950">Appearance</h2>
                <div className="mt-3 w-64">
                  <ThemeSegmented />
                </div>
              </section>
              <section>
                <h2 className="text-sm font-semibold text-ink-950">Notifications</h2>
                <div className="mt-3">
                  <PushPrompt />
                </div>
                <p className="mt-2 text-xs text-ink-500">Manage notification permissions in your browser settings at any time.</p>
              </section>
              <section>
                <h2 className="text-sm font-semibold text-ink-950">Demo data</h2>
                <p className="mt-1 text-sm text-ink-500">Everything you do is saved in this browser. Reset to start over.</p>
                <button
                  type="button"
                  onClick={() => {
                    resetDemo();
                    toast("Demo reset");
                    router.push("/");
                  }}
                  className={buttonClass("outline", "md", "mt-3")}
                >
                  Reset demo
                </button>
              </section>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <DisputeSheet order={reporting} onClose={() => setReporting(null)} />
      <ReviewSheet order={reviewing} onClose={() => setReviewing(null)} />
    </>
  );
}

function Empty({ title, body, cta, href }: { title: string; body: string; cta: string; href: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="font-semibold text-ink-950">{title}</p>
      <p className="mt-1 text-sm text-ink-500">{body}</p>
      <Link href={href} className={buttonClass("dark", "md", "mt-5")}>
        {cta}
      </Link>
    </div>
  );
}
