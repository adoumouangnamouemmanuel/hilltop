"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ExternalLink, EyeOff, Flag, RotateCcw, Star, StarOff, Store, Trash2 } from "lucide-react";
import { formatCedi } from "@hilltop/shared/format";
import { RelativeTime } from "@hilltop/ui/controls";
import { SafeImage } from "@hilltop/ui/safe-image";
import { buttonClass, cn } from "@hilltop/ui/ui";
import { Badge, Card, Confirm, EmptyState, Gate, PageHeader, SearchField, Segmented, Select } from "@/components/kit";
import { RowMenu } from "@/components/row-menu";
import { MARKETPLACE_URL } from "@/components/shell";
import { dismissReports, editDraft, setListingState } from "@/lib/model";
import { perform, useAdmin, useCan, usePublished, useWorkingConfig } from "@/lib/store";
import { useQueryState } from "@/lib/use-query";
import type { ListingState, ModListing } from "@/lib/types";

type View = "all" | "reported" | "featured" | "hidden" | "removed";

const filtersFor = (featured: string[]): Record<View, (l: ModListing) => boolean> => ({
  all: (l) => l.state !== "removed",
  reported: (l) => l.reports.length > 0 && l.state === "live",
  featured: (l) => featured.includes(l.id) && l.state === "live",
  hidden: (l) => l.state === "hidden",
  removed: (l) => l.state === "removed",
});

const stateBadge: Record<ListingState, React.ReactNode> = {
  live: (
    <Badge tone="success" dot>
      Live
    </Badge>
  ),
  hidden: (
    <Badge tone="warning" dot>
      Hidden
    </Badge>
  ),
  removed: (
    <Badge tone="maroon" dot>
      Removed
    </Badge>
  ),
  sold: (
    <Badge tone="muted" dot>
      Sold
    </Badge>
  ),
};

export function ListingsView() {
  return (
    <Gate permission="listings.view">
      <ListingsInner />
    </Gate>
  );
}

function ListingsInner() {
  const s = useAdmin();
  const config = useWorkingConfig();
  const { config: published } = usePublished();
  const featuredIds = config.featured.listingIds;
  const filters = useMemo(() => filtersFor(featuredIds), [featuredIds]);
  const isFeatured = (l: ModListing) => featuredIds.includes(l.id);
  // Featuring edits the platform config, so it goes live with the next publish.
  const toggleFeatured = (l: ModListing) =>
    perform(
      (st, now) =>
        editDraft(
          st,
          published,
          "listings.feature",
          `${isFeatured(l) ? "Unfeatured" : "Featured"} ${l.title}`,
          (c) => ({
            ...c,
            featured: {
              ...c.featured,
              listingIds: isFeatured(l) ? c.featured.listingIds.filter((x) => x !== l.id) : [...c.featured.listingIds, l.id],
            },
          }),
          now,
        ),
      isFeatured(l) ? "Removed from featured. Publish to update the marketplace." : "Added to featured. Publish to update the marketplace.",
    );
  const [view, setView] = useQueryState<View>("view", "all");
  const [q, setQ] = useQueryState<string>("q", "");
  const [category, setCategory] = useQueryState<string>("category", "");
  const [removing, setRemoving] = useState<ModListing | null>(null);
  const canModerate = useCan("listings.moderate");
  const canFeature = useCan("listings.feature");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return s.listings
      .filter(filters[view])
      .filter((l) => !category || l.category === category)
      .filter((l) => !term || `${l.title} ${l.sellerName}`.toLowerCase().includes(term))
      .sort((a, b) => b.reports.length - a.reports.length || b.postedAt - a.postedAt);
  }, [s.listings, view, q, category, filters]);

  const catLabel = (id: string) => config.categories.find((c) => c.id === id)?.label ?? id;

  const moderate = (l: ModListing, state: ListingState, msg: string) => perform((st, now) => setListingState(st, l.id, state, now), msg);

  return (
    <>
      <PageHeader title="Listings" description="Review reports, hide or remove listings that break the rules, and feature the best ones." />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          label="Filter listings"
          value={view}
          onChange={setView}
          options={(Object.keys(filters) as View[]).map((id) => ({
            id,
            label: id[0].toUpperCase() + id.slice(1),
            count: s.listings.filter(filters[id]).length,
          }))}
        />
        <div className="flex gap-2">
          <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
            <option value="">All categories</option>
            {config.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
          <SearchField value={q} onChange={setQ} placeholder="Search title or seller" className="flex-1 lg:w-64" />
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={view === "reported" ? Check : Store}
            title={view === "reported" ? "No open reports" : "No listings match"}
            body={view === "reported" ? "The queue is clear." : "Try another filter."}
          />
        </Card>
      ) : (
        <motion.ul layout className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {rows.map((l) => (
              <motion.li
                key={l.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className={cn(
                  "flex flex-col overflow-hidden rounded-2xl border bg-elevated",
                  l.reports.length && l.state === "live" ? "border-warning/40" : "border-line",
                )}
              >
                <div className="flex gap-3 p-3">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface">
                    <SafeImage src={l.image} alt="" fill sizes="80px" className={cn("object-cover", l.state !== "live" && "grayscale")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-[13.5px] leading-snug font-medium text-ink-950">{l.title}</p>
                      <RowMenu
                        label={l.title}
                        actions={[
                          {
                            label: "View on marketplace",
                            icon: ExternalLink,
                            onClick: () => window.open(`${MARKETPLACE_URL}/listing/${l.id}`, "_blank", "noopener"),
                          },
                          {
                            label: isFeatured(l) ? "Stop featuring" : "Feature",
                            icon: isFeatured(l) ? StarOff : Star,
                            hidden: !canFeature || l.state !== "live",
                            onClick: () => toggleFeatured(l),
                          },
                          {
                            label: "Hide",
                            icon: EyeOff,
                            hidden: !canModerate || l.state !== "live",
                            onClick: () => moderate(l, "hidden", "Listing hidden"),
                          },
                          {
                            label: "Restore",
                            icon: RotateCcw,
                            hidden: !canModerate || (l.state !== "hidden" && l.state !== "removed"),
                            onClick: () => moderate(l, "live", "Listing restored"),
                          },
                          {
                            label: "Remove",
                            icon: Trash2,
                            danger: true,
                            hidden: !canModerate || l.state === "removed",
                            onClick: () => setRemoving(l),
                          },
                        ]}
                      />
                    </div>
                    <p className="mt-0.5 text-[13px] font-semibold text-ink-950 tabular">{formatCedi(l.price)}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {l.sellerName} · {catLabel(l.category)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3">
                  {stateBadge[l.state]}
                  {isFeatured(l) && <Badge tone="maroon">Featured</Badge>}
                  {l.promoted && <Badge tone="neutral">Promoted</Badge>}
                  <span className="ml-auto text-xs text-ink-400 tabular">
                    {l.views.toLocaleString()} views · <RelativeTime at={l.postedAt} />
                  </span>
                </div>
                {l.reports.length > 0 && l.state === "live" && (
                  <div className="mt-auto border-t border-warning/25 bg-warning-bg/60 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                      <Flag className="size-3.5" aria-hidden />
                      {l.reports.length} report{l.reports.length > 1 ? "s" : ""}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {l.reports.slice(0, 3).map((r) => (
                        <li key={r.id} className="flex justify-between gap-2 text-xs text-ink-700">
                          <span className="truncate">
                            {r.reason} <span className="text-ink-500">by {r.by}</span>
                          </span>
                          <RelativeTime at={r.at} className="shrink-0 text-ink-400" />
                        </li>
                      ))}
                    </ul>
                    {canModerate && (
                      <div className="mt-2.5 flex gap-2">
                        <button
                          type="button"
                          onClick={() => perform((st, now) => dismissReports(st, l.id, now), "Reports dismissed")}
                          className={buttonClass("outline", "sm", "flex-1")}
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={() => moderate(l, "hidden", "Listing hidden")}
                          className={buttonClass("dark", "sm", "flex-1")}
                        >
                          Hide listing
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      <Confirm
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title="Remove this listing?"
        body={`“${removing?.title}” is taken down for everyone and its reports are closed. You can restore it from the Removed tab.`}
        confirmLabel="Remove listing"
        onConfirm={() => removing && moderate(removing, "removed", "Listing removed")}
      />
    </>
  );
}
