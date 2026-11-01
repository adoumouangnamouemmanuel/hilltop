"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, Heart, MoreHorizontal, Pencil, Plus, RefreshCw, Tag, Trash2, Undo2 } from "lucide-react";
import type { Listing, ListingStatus } from "@/lib/data";
import { formatCedi, postedLabel } from "@/lib/format";
import { useDismiss } from "@/lib/hooks";
import { useConfig } from "@/lib/config";
import { useStore } from "@/lib/store";
import { expiresIn } from "@hilltop/shared/ranking";
import { toast } from "@/lib/toast";
import { SafeImage } from "@/components/safe-image";
import { Sheet } from "@/components/sheet";
import { buttonClass, cn } from "@/components/ui";

const sections: { status: ListingStatus; title: string; empty: string }[] = [
  { status: "active", title: "Active", empty: "Nothing live right now." },
  { status: "expired", title: "Expired", empty: "Nothing has expired. Listings come down after a while unless you renew them." },
  { status: "draft", title: "Drafts", empty: "No drafts. Save one from the Sell page to finish later." },
  { status: "sold", title: "Sold", empty: "Sold items show up here." },
];

export function ListingsManager() {
  const { myListings } = useStore();
  const { maxActive } = useConfig().listings;
  const [deleting, setDeleting] = useState<Listing | null>(null);
  const [tab, setTab] = useState<ListingStatus>("active");
  const byStatus = (s: ListingStatus) => myListings.filter((l) => (l.status ?? "active") === s);
  const current = sections.find((s) => s.status === tab)!;
  const items = byStatus(tab);

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-950">Your listings</h2>
          {maxActive > 0 && (
            <p className="text-xs text-ink-500">
              {byStatus("active").length} of {maxActive} active listings
            </p>
          )}
        </div>
        <Link href="/sell" className={buttonClass("dark", "sm")}>
          <Plus className="size-3.5" aria-hidden /> New listing
        </Link>
      </div>
      <div className="mt-4 flex gap-1.5" role="tablist" aria-label="Listing status">
        {sections.map((s) => (
          <button
            key={s.status}
            type="button"
            role="tab"
            aria-selected={tab === s.status}
            onClick={() => setTab(s.status)}
            className={cn(
              "relative h-9 rounded-full px-4 text-[13px] font-medium transition-colors",
              tab === s.status ? "text-canvas" : "bg-surface text-ink-700 hover:bg-surface-2",
            )}
          >
            {tab === s.status && <motion.span layoutId="listing-tab" className="absolute inset-0 rounded-full bg-ink-950" />}
            <span className="relative">
              {s.title} <span className="opacity-60">{byStatus(s.status).length}</span>
            </span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-sm text-ink-500">
          {current.empty}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
          <AnimatePresence initial={false}>
            {items.map((l) => (
              <ListingRow key={l.id} listing={l} onDelete={() => setDeleting(l)} />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <DeleteSheet listing={deleting} onClose={() => setDeleting(null)} />
    </section>
  );
}

function ListingRow({ listing, onDelete }: { listing: Listing; onDelete: () => void }) {
  const { setListingStatus, renewListing } = useStore();
  const { expiryDays } = useConfig().listings;
  const status = listing.status ?? "active";
  const left = status === "active" ? expiresIn(listing, expiryDays) : null;
  return (
    <motion.li
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-center gap-3.5 p-3.5"
    >
      <Link href={`/listing/${listing.id}`} className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface">
        {listing.images[0] && (
          <SafeImage
            src={listing.images[0]}
            alt=""
            fill
            sizes="64px"
            unoptimized={listing.images[0].startsWith("data:")}
            className="object-cover"
          />
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/listing/${listing.id}`} className="block truncate text-sm font-medium text-ink-950 hover:underline">
          {listing.title || "Untitled draft"}
        </Link>
        <p className="text-sm font-semibold text-ink-950 tabular">{formatCedi(listing.price)}</p>
        <p className="mt-0.5 flex items-center gap-3 text-xs text-ink-500">
          <span className="flex items-center gap-1">
            <Eye className="size-3" aria-hidden /> {listing.views}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="size-3" aria-hidden /> {listing.saves}
          </span>
          <span>{postedLabel(listing.postedDaysAgo)}</span>
          {left !== null && left <= 5 && (
            <span className="font-medium text-warning">{left <= 1 ? "Expires today" : `Expires in ${left} days`}</span>
          )}
          {status === "expired" && <span className="font-medium text-warning">Hidden from buyers</span>}
        </p>
      </div>
      <ActionMenu
        label={`Actions for ${listing.title}`}
        items={[
          { label: status === "draft" ? "Continue editing" : "Edit", icon: Pencil, href: `/sell?edit=${listing.id}` },
          ...(status === "active"
            ? [
                {
                  label: "Mark as sold",
                  icon: Tag,
                  onClick: () => {
                    setListingStatus(listing.id, "sold");
                    toast("Marked as sold");
                  },
                },
                {
                  label: "Renew to the top",
                  icon: RefreshCw,
                  onClick: () => {
                    renewListing(listing.id);
                    toast("Renewed. It shows as new again.", { tone: "success" });
                  },
                },
              ]
            : []),
          ...(status === "expired"
            ? [
                {
                  label: "Renew listing",
                  icon: RefreshCw,
                  onClick: () => {
                    renewListing(listing.id);
                    toast("Renewed. It's live again.", { tone: "success" });
                  },
                },
              ]
            : []),
          ...(status === "sold"
            ? [
                {
                  label: "Relist",
                  icon: Undo2,
                  onClick: () => {
                    renewListing(listing.id);
                    toast("Back on sale", { tone: "success" });
                  },
                },
              ]
            : []),
          { label: "Delete", icon: Trash2, onClick: onDelete, danger: true },
        ]}
      />
    </motion.li>
  );
}

type MenuItem = { label: string; icon: typeof Pencil; href?: string; onClick?: () => void; danger?: boolean };

function ActionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const itemClass = (danger?: boolean) =>
    cn(
      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface",
      danger ? "text-maroon-700" : "text-ink-700 hover:text-ink-950",
    );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        className="grid size-9 place-items-center rounded-full text-ink-500 hover:bg-surface hover:text-ink-950"
      >
        <MoreHorizontal className="size-5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full right-0 z-30 mt-1 w-52 origin-top-right rounded-xl border border-line bg-elevated p-1.5 shadow-pop"
          >
            {items.map((item) =>
              item.href ? (
                <Link key={item.label} href={item.href} role="menuitem" className={itemClass(item.danger)}>
                  <item.icon className="size-4" aria-hidden /> {item.label}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onClick?.();
                  }}
                  className={itemClass(item.danger)}
                >
                  <item.icon className="size-4" aria-hidden /> {item.label}
                </button>
              ),
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DeleteSheet({ listing, onClose }: { listing: Listing | null; onClose: () => void }) {
  const { deleteListing } = useStore();
  return (
    <Sheet
      open={!!listing}
      onClose={onClose}
      title="Delete listing?"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className={buttonClass("outline", "lg")}>
            Keep it
          </button>
          <button
            type="button"
            onClick={() => {
              if (listing) deleteListing(listing.id);
              toast("Listing deleted");
              onClose();
            }}
            className={buttonClass("primary", "lg")}
          >
            Delete
          </button>
        </div>
      }
    >
      <p className="text-sm leading-6 text-ink-500">
        &ldquo;{listing?.title}&rdquo; will be removed from Hilltop and from anyone&rsquo;s saved list. This can&rsquo;t be undone.
      </p>
    </Sheet>
  );
}
