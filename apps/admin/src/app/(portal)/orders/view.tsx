"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Download, Undo2, Wallet } from "lucide-react";
import { formatCedi } from "@hilltop/shared/format";
import { RelativeTime } from "@hilltop/ui/controls";
import { buttonClass } from "@hilltop/ui/ui";
import { Badge, Card, Confirm, EmptyState, Gate, PageHeader, SearchField, Segmented, Table, Td, Th, type Tone } from "@/components/kit";
import { useDetail } from "@/components/details";
import { RowMenu } from "@/components/row-menu";
import { downloadCsv } from "@/lib/csv";
import { refundOrder, releaseOrder } from "@/lib/model";
import { perform, useAdmin, useCan, useWorkingConfig } from "@/lib/store";
import { useQueryState } from "@/lib/use-query";
import type { AdminOrder, OrderStatus } from "@/lib/types";
import { autoReleaseAt, type PaymentKind } from "@hilltop/shared/payments";

type View = "all" | OrderStatus;

const statusMeta: Record<OrderStatus, { label: string; tone: Tone }> = {
  paid: { label: "Awaiting pickup", tone: "neutral" },
  ready: { label: "Ready for pickup", tone: "warning" },
  collected: { label: "Collected", tone: "success" },
  disputed: { label: "Disputed", tone: "maroon" },
  refunded: { label: "Refunded", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

const paymentMeta: Record<PaymentKind, { label: string; tone: Tone }> = {
  protected: { label: "Protected", tone: "maroon" },
  deposit: { label: "Deposit", tone: "warning" },
  pickup: { label: "Pay at pickup", tone: "muted" },
};

const PAGE = 40;

export function OrdersView() {
  return (
    <Gate permission="orders.view">
      <OrdersInner />
    </Gate>
  );
}

function OrdersInner() {
  const s = useAdmin();
  const [view, setView] = useQueryState<View>("view", "all");
  const [q, setQ] = useQueryState<string>("q", "");
  const [limit, setLimit] = useState(PAGE);
  const [confirm, setConfirm] = useState<{ order: AdminOrder; kind: "refund" | "release" } | null>(null);
  const canRefund = useCan("orders.refund");
  const detail = useDetail();
  const [now] = useState(() => Date.now());
  const config = useWorkingConfig();

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return s.orders
      .filter((o) => view === "all" || o.status === view)
      .filter((o) => !term || `${o.id} ${o.title} ${o.buyer} ${o.seller}`.toLowerCase().includes(term))
      .sort((a, b) => b.placedAt - a.placedAt);
  }, [s.orders, view, q]);

  const held = s.orders.filter((o) => o.payment !== "pickup" && (o.status === "paid" || o.status === "ready" || o.status === "disputed"));
  const sum = (list: AdminOrder[]) => list.reduce((n, o) => n + o.amount, 0);
  const heldSum = held.reduce((n, o) => n + o.paidInApp - o.fee, 0);
  // Pay-at-pickup orders have no money in the platform to refund or release.
  const open = (o: AdminOrder) => o.payment !== "pickup" && o.status !== "collected" && o.status !== "refunded";
  const releaseIn = (o: AdminOrder) => {
    const at = autoReleaseAt(o.handedOverAt, config.protection.autoReleaseHours);
    return at && o.status === "ready" ? Math.max(1, Math.ceil((at - now) / 3_600_000)) : null;
  };

  const actions = (o: AdminOrder) => [
    {
      label: "Release payout to seller",
      icon: Wallet,
      hidden: !canRefund || !open(o),
      onClick: () => setConfirm({ order: o, kind: "release" }),
    },
    {
      label: "Refund buyer",
      icon: Undo2,
      danger: true,
      hidden: !canRefund || !open(o),
      onClick: () => setConfirm({ order: o, kind: "refund" }),
    },
  ];

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order. Protected payments and deposits are held until the buyer collects or the auto-release window passes; pay-at-pickup orders go straight to the seller."
      >
        <button
          type="button"
          className={buttonClass("outline", "sm")}
          onClick={() =>
            downloadCsv(
              "orders.csv",
              rows.map(({ id, title, buyer, seller, amount, fee, method, pickup, status, placedAt }) => ({
                id,
                title,
                buyer,
                seller,
                amount,
                fee,
                method,
                pickup,
                status,
                placedAt: new Date(placedAt).toISOString(),
              })),
            )
          }
        >
          <Download className="size-4" aria-hidden />
          Export
        </button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-3 gap-3">
        {[
          ["Held in protection", heldSum, `${held.length} orders`],
          [
            "Released this month",
            sum(s.orders.filter((o) => o.status === "collected" && now - o.placedAt < 30 * 86_400_000)),
            "To sellers",
          ],
          ["Refunded", sum(s.orders.filter((o) => o.status === "refunded")), "All time"],
        ].map(([label, value, sub]) => (
          <Card key={label as string} className="p-4">
            <p className="text-xs font-medium text-ink-500">{label}</p>
            <p className="mt-1 text-lg font-semibold tracking-[-0.02em] text-ink-950 tabular sm:text-xl">{formatCedi(value as number)}</p>
            <p className="text-xs text-ink-400">{sub}</p>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          label="Filter orders"
          value={view}
          onChange={(v) => {
            setView(v);
            setLimit(PAGE);
          }}
          options={[
            { id: "all", label: "All", count: s.orders.length },
            ...(Object.keys(statusMeta) as OrderStatus[]).map((id) => ({
              id,
              label: statusMeta[id].label.split(",")[0],
              count: s.orders.filter((o) => o.status === id).length,
            })),
          ]}
        />
        <SearchField value={q} onChange={setQ} placeholder="Order number, item, buyer or seller" className="lg:w-80" />
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No orders match" />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Item</Th>
                    <Th>Buyer → Seller</Th>
                    <Th>Status</Th>
                    <Th align="right">Amount</Th>
                    <Th align="right">Fee</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map((o) => (
                    <tr key={o.id} onClick={() => detail.open("order", o.id)} className="cursor-pointer hover:bg-surface/60">
                      <Td>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            detail.open("order", o.id);
                          }}
                          className="block font-medium text-ink-950 tabular hover:underline"
                        >
                          {o.id}
                        </button>
                        <RelativeTime at={o.placedAt} className="text-xs text-ink-500" />
                      </Td>
                      <Td className="max-w-[220px]">
                        <p className="truncate text-ink-900">{o.title}</p>
                        <p className="truncate text-xs text-ink-500">
                          {o.method} · {o.pickup}
                        </p>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {o.buyer} <span className="text-ink-400">→</span> {o.seller}
                      </Td>
                      <Td>
                        <OrderBadges order={o} releaseIn={releaseIn(o)} />
                      </Td>
                      <Td align="right" className="font-medium text-ink-950">
                        {formatCedi(o.amount)}
                      </Td>
                      <Td align="right">{formatCedi(o.fee)}</Td>
                      <Td align="right">
                        <div onClick={(e) => e.stopPropagation()}>
                          <RowMenu label={o.id} actions={actions(o)} />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {rows.slice(0, limit).map((o) => (
                <li key={o.id} className="flex items-start gap-3 px-4 py-3.5">
                  <button type="button" onClick={() => detail.open("order", o.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[13.5px] font-medium text-ink-950">{o.title}</p>
                      <p className="shrink-0 text-[13.5px] font-semibold text-ink-950 tabular">{formatCedi(o.amount)}</p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {o.id} · {o.buyer} → {o.seller}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <OrderBadges order={o} releaseIn={releaseIn(o)} />
                      <RelativeTime at={o.placedAt} className="text-xs text-ink-400" />
                    </div>
                  </button>
                  <RowMenu label={o.id} actions={actions(o)} />
                </li>
              ))}
            </ul>
            {rows.length > limit && (
              <div className="border-t border-line p-3 text-center">
                <button type="button" onClick={() => setLimit((l) => l + PAGE)} className={buttonClass("ghost", "sm")}>
                  Show more ({rows.length - limit} left)
                </button>
              </div>
            )}
          </>
        )}
      </Card>

      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        danger={confirm?.kind === "refund"}
        title={confirm?.kind === "refund" ? `Refund ${confirm.order.id}?` : `Release ${confirm?.order.id}?`}
        body={
          confirm?.kind === "refund"
            ? `${confirm.order.buyer} gets ${formatCedi(confirm.order.amount + confirm.order.fee)} back, including the protection fee.`
            : `${confirm?.order.seller} is paid ${formatCedi(confirm?.order.amount ?? 0)} now, without waiting for the buyer to confirm collection.`
        }
        confirmLabel={confirm?.kind === "refund" ? "Refund buyer" : "Release payout"}
        onConfirm={() => {
          if (!confirm) return;
          const { order, kind } = confirm;
          if (kind === "refund") perform((st, now) => refundOrder(st, order.id, now), "Buyer refunded");
          else perform((st, now) => releaseOrder(st, order.id, now), "Payout released");
        }}
      />
    </>
  );
}

function OrderBadges({ order, releaseIn }: { order: AdminOrder; releaseIn: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone={statusMeta[order.status].tone} dot>
        {statusMeta[order.status].label}
      </Badge>
      <Badge tone={paymentMeta[order.payment].tone}>{paymentMeta[order.payment].label}</Badge>
      {releaseIn !== null && <span className="text-[11px] whitespace-nowrap text-ink-500">Auto-releases in {releaseIn}h</span>}
    </div>
  );
}
