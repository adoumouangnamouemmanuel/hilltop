"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, Heart, Search, Trash2 } from "lucide-react";
import { formatCedi } from "@/lib/format";
import { searchMatches } from "@/lib/model";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { SavedSearch } from "@/lib/types";
import { useCatalog } from "@/lib/use-catalog";
import { useListings } from "@/lib/use-listings";
import { RelativeTime, Switch } from "@/components/controls";
import { ListingCard } from "@/components/listing-card";
import { buttonClass, cn } from "@/components/ui";

const tabs = { items: "Items", searches: "Searches", recent: "Recently viewed" } as const;
type Tab = keyof typeof tabs;

export function SavedView() {
  const router = useRouter();
  const pathname = usePathname();
  const param = useSearchParams().get("tab");
  const tab: Tab = param === "searches" || param === "recent" ? param : "items";
  const { saved, savedSearches, recentlyViewed } = useStore();
  const items = useListings({ ids: saved, includeSold: true });
  const recent = useListings({ ids: recentlyViewed, includeSold: true });
  const total = items.reduce((sum, l) => sum + l.price, 0);

  const counts: Record<Tab, number> = { items: items.length, searches: savedSearches.length, recent: recent.length };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-3xl">Saved</h1>
      <div className="mt-6 flex gap-6 border-b border-line" role="tablist">
        {(Object.keys(tabs) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => router.replace(t === "items" ? pathname : `${pathname}?tab=${t}`, { scroll: false })}
            className={cn("relative pb-3 text-sm font-medium", tab === t ? "text-ink-950" : "text-ink-500 hover:text-ink-950")}
          >
            {tabs[t]} <span className="text-ink-500">{counts[t]}</span>
            {tab === t && <motion.span layoutId="saved-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink-950" />}
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
          {tab === "items" &&
            (items.length ? (
              <>
                <p className="mb-6 text-sm text-ink-500">
                  {items.length} {items.length === 1 ? "item" : "items"}, {formatCedi(total)} in total
                </p>
                <Grid>
                  {items.map((l) => (
                    <ListingCard key={l.id} listing={l} />
                  ))}
                </Grid>
              </>
            ) : (
              <Empty icon={Heart} title="Nothing saved yet" body="Tap the heart on any listing to keep it here." />
            ))}

          {tab === "searches" &&
            (savedSearches.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                <AnimatePresence initial={false}>
                  {savedSearches.map((s) => (
                    <SavedSearchCard key={s.id} search={s} />
                  ))}
                </AnimatePresence>
              </ul>
            ) : (
              <Empty
                icon={Search}
                title="No saved searches"
                body="Search or filter on Browse, then tap Save search to get alerts for new matches."
              />
            ))}

          {tab === "recent" &&
            (recent.length ? (
              <Grid>
                {recent.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </Grid>
            ) : (
              <Empty icon={Clock} title="Nothing viewed yet" body="Listings you open show up here so you can find them again." />
            ))}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function SavedSearchCard({ search }: { search: SavedSearch }) {
  const { activeListings, removeSearch, toggleAlerts, markSearchSeen } = useStore();
  const catalog = useCatalog();
  const matches = searchMatches(activeListings, search.query, (id) => catalog.get(id).label);
  const fresh = matches.filter((l) => !search.seenIds.includes(l.id)).length;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="rounded-2xl border border-line p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-950">{search.label}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {matches.length} {matches.length === 1 ? "match" : "matches"} · saved <RelativeTime at={search.createdAt} />
          </p>
        </div>
        {fresh > 0 && (
          <span className="shrink-0 rounded-full bg-maroon-700 px-2 py-0.5 text-[11px] font-semibold text-white">{fresh} new</span>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="flex items-center gap-2 text-[13px] text-ink-700">
          <Switch checked={search.alerts} onChange={() => toggleAlerts(search.id)} label={`Alerts for ${search.label}`} />
          Alerts
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => {
              removeSearch(search.id);
              toast("Search removed");
            }}
            className="grid size-9 place-items-center rounded-full text-ink-500 hover:bg-surface hover:text-ink-950"
            aria-label={`Remove ${search.label}`}
          >
            <Trash2 className="size-4" />
          </button>
          <Link
            href={`/browse?${search.query}`}
            onClick={() =>
              markSearchSeen(
                search.id,
                matches.map((l) => l.id),
              )
            }
            className={buttonClass("dark", "sm")}
          >
            View
          </Link>
        </div>
      </div>
    </motion.li>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-5">{children}</div>;
}

function Empty({ icon: Icon, title, body }: { icon: typeof Heart; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
      <Icon className="mx-auto size-8 text-ink-300" aria-hidden />
      <p className="mt-4 font-semibold text-ink-950">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">{body}</p>
      <Link href="/browse" className={buttonClass("dark", "md", "mt-6")}>
        Browse items
      </Link>
    </div>
  );
}
