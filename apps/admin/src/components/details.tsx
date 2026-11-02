"use client";

import { useState } from "react";
import { BadgeCheck, BadgeX, Ban, ExternalLink, EyeOff, Flag, Mail, RotateCcw, Trash2, Undo2, Wallet } from "lucide-react";
import { formatCedi } from "@hilltop/shared/format";
import { RelativeTime } from "@hilltop/ui/controls";
import { SafeImage } from "@hilltop/ui/safe-image";
import { Sheet } from "@hilltop/ui/sheet";
import { Avatar, buttonClass, cn, Verified } from "@hilltop/ui/ui";
import { deleteUser, dismissReports, refundOrder, releaseOrder, setListingState, setSuspended, setVerified } from "@/lib/model";
import { perform, useAdmin, useCan, useWorkingConfig } from "@/lib/store";
import { useQueryState } from "@/lib/use-query";
import type { AdminOrder, AdminUser, ListingState, ModListing, OrderStatus } from "@/lib/types";
import { Badge, Confirm } from "./kit";

/*
 * Details of a student, listing or order, opened from any screen. A panel down the
 * right on desktop, a bottom sheet on phones. Which one is open lives in the URL
 * (?detail=user:<id>), so details can be shared and panels can open each other.
 */

type Kind = "user" | "listing" | "order";

const MARKETPLACE_URL = process.env.NEXT_PUBLIC_MARKETPLACE_URL || "http://localhost:3000";
const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Opens and closes the details panel. */
export function useDetail() {
  const [value, setValue] = useQueryState<string>("detail", "");
  const at = value.indexOf(":");
  const kind = at > 0 ? (value.slice(0, at) as Kind) : null;
  const id = at > 0 ? value.slice(at + 1) : "";
  return { kind, id, open: (k: Kind, target: string) => setValue(`${k}:${target}`), close: () => setValue("") };
}

/** The panel itself. Mounted once, in the portal shell. */
export function DetailHost() {
  const { kind, id, close } = useDetail();
  const s = useAdmin();
  const user = kind === "user" ? s.users.find((u) => u.id === id) : undefined;
  const listing = kind === "listing" ? s.listings.find((l) => l.id === id) : undefined;
  const order = kind === "order" ? s.orders.find((o) => o.id === id) : undefined;
  const title = user ? "Student" : listing ? "Listing" : order ? `Order ${order.id.replace("ord-", "#")}` : "Details";
  return (
    <Sheet side open={!!(user || listing || order)} onClose={close} title={title}>
      {user && <UserDetail user={user} />}
      {listing && <ListingDetail listing={listing} />}
      {order && <OrderDetail order={order} />}
    </Sheet>
  );
}

// Building blocks ---------------------------------------------------------------------------

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-line rounded-xl border border-line text-[13px]">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 px-3.5 py-2.5">
          <dt className="text-ink-500">{label}</dt>
          <dd className="text-right font-medium text-ink-950">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** A row that opens another panel. */
function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface">
        {children}
      </button>
    </li>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex flex-wrap gap-2">{children}</div>;
}

const listingBadge: Record<ListingState, React.ReactNode> = {
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

const orderLabel: Record<OrderStatus, string> = {
  paid: "Awaiting pickup",
  ready: "Ready for pickup",
  collected: "Collected",
  disputed: "Disputed",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

// A student ------------------------------------------------------------------------------------

function UserDetail({ user: u }: { user: AdminUser }) {
  const s = useAdmin();
  const { open, close } = useDetail();
  const canVerify = useCan("users.verify");
  const canSuspend = useCan("users.suspend");
  const canDelete = useCan("users.delete");
  const [confirm, setConfirm] = useState<"suspend" | "delete" | null>(null);
  const listings = s.listings.filter((l) => l.sellerId === u.id);
  const orders = s.orders.filter((o) => o.buyerId === u.id || o.sellerId === u.id).slice(0, 20);

  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={u.name} size={52} />
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-lg font-semibold text-ink-950">
            {u.name} {u.verified && <Verified />}
          </p>
          {u.email && (
            <a href={`mailto:${u.email}`} className="flex items-center gap-1 truncate text-sm text-ink-500 hover:text-ink-950">
              <Mail className="size-3.5" aria-hidden /> {u.email}
            </a>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {u.status === "suspended" ? (
          <Badge tone="maroon" dot>
            Suspended
          </Badge>
        ) : u.verified ? (
          <Badge tone="success" dot>
            Verified
          </Badge>
        ) : (
          <Badge tone="warning" dot>
            Unverified
          </Badge>
        )}
        {u.reports > 0 && <Badge tone="maroon">{u.reports} reports on their listings</Badge>}
      </div>

      <Actions>
        {canVerify && (
          <button
            type="button"
            className={buttonClass("outline", "sm")}
            onClick={() =>
              perform((st, now) => setVerified(st, u.id, !u.verified, now), u.verified ? "Verification removed" : `${u.name} verified`)
            }
          >
            {u.verified ? <BadgeX className="size-4" aria-hidden /> : <BadgeCheck className="size-4" aria-hidden />}
            {u.verified ? "Remove verification" : "Verify"}
          </button>
        )}
        {canSuspend &&
          (u.status === "suspended" ? (
            <button
              type="button"
              className={buttonClass("outline", "sm")}
              onClick={() => perform((st, now) => setSuspended(st, u.id, false, now), `${u.name} reinstated`)}
            >
              <RotateCcw className="size-4" aria-hidden /> Reinstate
            </button>
          ) : (
            <button type="button" className={buttonClass("outline", "sm", "text-maroon-700")} onClick={() => setConfirm("suspend")}>
              <Ban className="size-4" aria-hidden /> Suspend
            </button>
          ))}
        {canDelete && (
          <button type="button" className={buttonClass("ghost", "sm", "text-maroon-700")} onClick={() => setConfirm("delete")}>
            <Trash2 className="size-4" aria-hidden /> Delete account
          </button>
        )}
      </Actions>

      <Section title="Profile">
        <Facts
          rows={[
            ["Major", u.major ?? "Not added"],
            ["Class of", u.classOf ?? "Not added"],
            ...(u.specialty ? ([["Sells", u.specialty]] as [string, string][]) : []),
            ["Joined", date.format(u.joinedAt)],
            ["Live listings", u.listings],
            ["Sales", u.sales],
            ["Purchases", u.purchases],
            ["Rating", u.rating ? `${u.rating.toFixed(1)} / 5` : "No reviews yet"],
          ]}
        />
      </Section>

      <Section title={`Listings (${listings.length})`}>
        {listings.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {listings.map((l) => (
              <Row key={l.id} onClick={() => open("listing", l.id)}>
                <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-surface">
                  <SafeImage src={l.image} alt="" fill sizes="40px" className="object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink-950">{l.title}</span>
                  <span className="text-xs text-ink-500 tabular">{formatCedi(l.price)}</span>
                </span>
                {listingBadge[l.state]}
              </Row>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-500">No listings.</p>
        )}
      </Section>

      <Section title="Orders">
        {orders.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {orders.map((o) => (
              <Row key={o.id} onClick={() => open("order", o.id)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink-950">{o.title}</span>
                  <span className="text-xs text-ink-500">
                    {o.buyerId === u.id ? `Bought from ${o.seller}` : `Sold to ${o.buyer}`} · <RelativeTime at={o.placedAt} />
                  </span>
                </span>
                <span className="text-[13px] font-medium text-ink-950 tabular">{formatCedi(o.amount)}</span>
              </Row>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-500">No orders.</p>
        )}
      </Section>

      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        danger
        title={confirm === "delete" ? `Delete ${u.name}?` : `Suspend ${u.name}?`}
        body={
          confirm === "delete"
            ? "Everything that's theirs is deleted: sign-in, email, listings and photos, chats, offers, reviews, reports, saved items and notifications. Orders and the audit log keep their name for the record. This can't be undone."
            : "They won't be able to message, make offers, order or list, and their live listings are hidden. You can reinstate them later."
        }
        confirmLabel={confirm === "delete" ? "Delete account" : "Suspend"}
        onConfirm={() => {
          if (confirm === "delete") {
            if (perform((st, now) => deleteUser(st, u.id, now), `${u.name}'s account was deleted`)) close();
          } else perform((st, now) => setSuspended(st, u.id, true, now), `${u.name} suspended`);
        }}
      />
    </>
  );
}

// A listing ------------------------------------------------------------------------------------

function ListingDetail({ listing: l }: { listing: ModListing }) {
  const { open } = useDetail();
  const config = useWorkingConfig();
  const canModerate = useCan("listings.moderate");
  const [removing, setRemoving] = useState(false);
  const [shown, setShown] = useState(0);
  const images = l.images?.length ? l.images : [l.image].filter(Boolean);
  const moderate = (state: ListingState, msg: string) => perform((st, now) => setListingState(st, l.id, state, now), msg);
  const category = config.categories.find((c) => c.id === l.category)?.label ?? l.category;

  return (
    <>
      {images.length > 0 && (
        <div>
          <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-xl bg-surface">
            <SafeImage src={images[shown] ?? images[0]} alt={l.title} fill sizes="280px" className="object-cover" />
          </div>
          {images.length > 1 && (
            <div className="mt-2 flex justify-center gap-2 overflow-x-auto">
              {images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setShown(i)}
                  aria-label={`Photo ${i + 1}`}
                  className={cn("relative size-14 shrink-0 overflow-hidden rounded-lg", i === shown && "ring-2 ring-ink-950")}
                >
                  <SafeImage src={src} alt="" fill sizes="56px" className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-lg leading-snug font-semibold text-ink-950">{l.title}</p>
          <p className="mt-0.5 text-[15px] font-semibold text-ink-950 tabular">{formatCedi(l.price)}</p>
        </div>
        {listingBadge[l.state]}
      </div>

      <Actions>
        <a href={`${MARKETPLACE_URL}/listing/${l.id}`} target="_blank" rel="noopener" className={buttonClass("outline", "sm")}>
          <ExternalLink className="size-4" aria-hidden /> View on marketplace
        </a>
        {canModerate && l.state === "live" && (
          <button type="button" className={buttonClass("outline", "sm")} onClick={() => moderate("hidden", "Listing hidden")}>
            <EyeOff className="size-4" aria-hidden /> Hide
          </button>
        )}
        {canModerate && (l.state === "hidden" || l.state === "removed") && (
          <button type="button" className={buttonClass("outline", "sm")} onClick={() => moderate("live", "Listing restored")}>
            <RotateCcw className="size-4" aria-hidden /> Restore
          </button>
        )}
        {canModerate && l.state !== "removed" && (
          <button type="button" className={buttonClass("ghost", "sm", "text-maroon-700")} onClick={() => setRemoving(true)}>
            <Trash2 className="size-4" aria-hidden /> Remove
          </button>
        )}
      </Actions>

      {l.reports.length > 0 && (
        <Section title={`Open reports (${l.reports.length})`}>
          <ul className="space-y-2">
            {l.reports.map((r) => (
              <li key={r.id} className="flex items-start gap-2 rounded-xl bg-warning-bg/60 px-3.5 py-2.5 text-[13px]">
                <Flag className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink-950">
                    {config.reports.reasons.find((x) => x.id === r.reason)?.label ?? r.reason}
                  </span>
                  <span className="block text-xs text-ink-500">
                    by {r.by} · <RelativeTime at={r.at} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {canModerate && (
            <button
              type="button"
              onClick={() => perform((st, now) => dismissReports(st, l.id, now), "Reports dismissed")}
              className={buttonClass("outline", "sm", "mt-2")}
            >
              Dismiss reports
            </button>
          )}
        </Section>
      )}

      <Section title="Details">
        <Facts
          rows={[
            [
              "Seller",
              <button key="s" type="button" className="underline underline-offset-4" onClick={() => open("user", l.sellerId)}>
                {l.sellerName}
              </button>,
            ],
            ["Category", category],
            ...(l.condition ? ([["Condition", l.condition]] as [string, string][]) : []),
            ...(l.stock !== undefined ? ([["In stock", l.stock]] as [string, number][]) : []),
            ["Pickup", l.pickup || "Not set"],
            ["Views", l.views.toLocaleString()],
            ["Saves", l.saves.toLocaleString()],
            ["Listed", dateTime.format(l.postedAt)],
            ["Promoted", l.promoted ? "Yes" : "No"],
          ]}
        />
      </Section>

      {l.description && (
        <Section title="Description">
          <p className="text-[13.5px] leading-6 whitespace-pre-line text-ink-700">{l.description}</p>
        </Section>
      )}

      <Confirm
        open={removing}
        onClose={() => setRemoving(false)}
        danger
        title="Remove this listing?"
        body={`“${l.title}” is taken down for everyone and its reports are closed. You can restore it later.`}
        confirmLabel="Remove listing"
        onConfirm={() => moderate("removed", "Listing removed")}
      />
    </>
  );
}

// An order -------------------------------------------------------------------------------------

function OrderDetail({ order: o }: { order: AdminOrder }) {
  const { open } = useDetail();
  const canRefund = useCan("orders.refund");
  const [confirm, setConfirm] = useState<"refund" | "release" | null>(null);
  // Pay-at-pickup orders have no money in the platform to refund or release.
  const settleable = o.payment !== "pickup" && o.status !== "collected" && o.status !== "refunded" && o.status !== "cancelled";
  const person = (id: string | undefined, name: string) =>
    id ? (
      <button type="button" className="underline underline-offset-4" onClick={() => open("user", id)}>
        {name}
      </button>
    ) : (
      name
    );

  return (
    <>
      <button type="button" onClick={() => o.listingId && open("listing", o.listingId)} className="text-left">
        <p className="text-lg leading-snug font-semibold text-ink-950 hover:underline">{o.title}</p>
      </button>
      <p className="mt-0.5 text-[15px] font-semibold text-ink-950 tabular">
        {formatCedi(o.amount)}
        {o.quantity && o.quantity > 1 && <span className="font-normal text-ink-500"> for {o.quantity}</span>}
      </p>
      <div className="mt-3">
        <Badge tone={o.status === "collected" ? "success" : o.status === "cancelled" || o.status === "refunded" ? "muted" : "warning"} dot>
          {orderLabel[o.status]}
        </Badge>
      </div>

      {canRefund && settleable && (
        <Actions>
          <button type="button" className={buttonClass("outline", "sm")} onClick={() => setConfirm("release")}>
            <Wallet className="size-4" aria-hidden /> Release to seller
          </button>
          <button type="button" className={buttonClass("ghost", "sm", "text-maroon-700")} onClick={() => setConfirm("refund")}>
            <Undo2 className="size-4" aria-hidden /> Refund buyer
          </button>
        </Actions>
      )}

      <Section title="Details">
        <Facts
          rows={[
            ["Buyer", person(o.buyerId, o.buyer)],
            ["Seller", person(o.sellerId, o.seller)],
            [
              "Payment",
              o.payment === "pickup" ? "Paid to the seller at pickup" : o.payment === "deposit" ? "Deposit in the app" : "Held in the app",
            ],
            ...(o.paidInApp ? ([["Paid in the app", formatCedi(o.paidInApp)]] as [string, string][]) : []),
            ...(o.fee ? ([["Protection fee", formatCedi(o.fee)]] as [string, string][]) : []),
            ["Pickup", [o.pickup, o.slot].filter(Boolean).join(", ") || "Not set"],
            ["Placed", dateTime.format(o.placedAt)],
          ]}
        />
      </Section>

      {o.timeline && o.timeline.length > 0 && (
        <Section title="History">
          <ol className="space-y-2.5 border-l border-line pl-4 text-[13px]">
            {o.timeline.map((t, i) => (
              <li key={i} className="relative">
                <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-ink-950" aria-hidden />
                <span className="font-medium text-ink-950">{orderLabel[t.status]}</span>
                <span className="block text-xs text-ink-500">{dateTime.format(t.at)}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        danger={confirm === "refund"}
        title={confirm === "refund" ? "Refund the buyer?" : "Release the payout?"}
        body={
          confirm === "refund" ? "The buyer gets their money back and the order is closed." : "The seller is paid and the order is closed."
        }
        confirmLabel={confirm === "refund" ? "Refund" : "Release"}
        onConfirm={() =>
          confirm === "refund"
            ? perform((st, now) => refundOrder(st, o.id, now), "Buyer refunded")
            : perform((st, now) => releaseOrder(st, o.id, now), "Payout released")
        }
      />
    </>
  );
}
