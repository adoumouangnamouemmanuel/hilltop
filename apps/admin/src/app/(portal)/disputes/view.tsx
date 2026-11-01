"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Clock, Gavel, Undo2, Wallet } from "lucide-react";
import { formatCedi } from "@hilltop/shared/format";
import { RelativeTime } from "@hilltop/ui/controls";
import { Avatar, buttonClass, cn } from "@hilltop/ui/ui";
import { Badge, Card, EmptyState, Gate, PageHeader, Segmented, TextArea } from "@/components/kit";
import { disputeDue } from "@/lib/metrics";
import { resolveDispute } from "@/lib/model";
import { perform, useAdmin, useCan, useWorkingConfig } from "@/lib/store";
import { useQueryState } from "@/lib/use-query";
import type { AdminDispute } from "@/lib/types";

const clock = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function DisputesView() {
  return (
    <Gate permission="disputes.view">
      <DisputesInner />
    </Gate>
  );
}

function Due({ dispute, hours, now }: { dispute: AdminDispute; hours: number; now: number }) {
  const left = disputeDue(dispute.openedAt, hours) - now;
  const h = Math.round(Math.abs(left) / 3_600_000);
  return left < 0 ? (
    <Badge tone="maroon" dot>
      {h}h overdue
    </Badge>
  ) : (
    <Badge tone={left < 6 * 3_600_000 ? "warning" : "neutral"}>
      <Clock className="size-3" aria-hidden />
      {h}h left
    </Badge>
  );
}

function DisputesInner() {
  const s = useAdmin();
  const config = useWorkingConfig();
  const [tab, setTab] = useQueryState<"open" | "resolved">("view", "open");
  const [selected, setSelected] = useQueryState<string>("id", "");
  const [now] = useState(() => Date.now());

  const list = useMemo(
    () =>
      s.disputes
        .filter((d) => (tab === "open" ? d.state === "open" : d.state !== "open"))
        .sort((a, b) => (tab === "open" ? a.openedAt - b.openedAt : b.openedAt - a.openedAt)),
    [s.disputes, tab],
  );
  const current = s.disputes.find((d) => d.id === selected) ?? (selected ? undefined : list[0]);
  const reason = (id: string) => config.disputes.reasons.find((r) => r.id === id)?.label ?? id;
  const order = (d: AdminDispute) => s.orders.find((o) => o.id === d.orderId);

  return (
    <>
      <PageHeader
        title="Disputes"
        description={`Buyers raise a dispute when something goes wrong. The payout stays frozen until you decide. Target response time: ${config.disputes.responseHours} hours.`}
      />
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className={cn(selected && "hidden lg:block")}>
          <Segmented
            label="Dispute status"
            value={tab}
            onChange={(v) => {
              setTab(v);
              setSelected("");
            }}
            className="mb-3"
            options={[
              { id: "open", label: "Open", count: s.disputes.filter((d) => d.state === "open").length },
              { id: "resolved", label: "Resolved", count: s.disputes.filter((d) => d.state !== "open").length },
            ]}
          />
          {list.length === 0 ? (
            <Card>
              <EmptyState
                icon={CheckCircle2}
                title={tab === "open" ? "No open disputes" : "Nothing resolved yet"}
                body={tab === "open" ? "Nice. Every claim has been handled." : undefined}
              />
            </Card>
          ) : (
            <ul className="space-y-2">
              {list.map((d) => {
                const o = order(d);
                const active = current?.id === d.id;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(d.id)}
                      aria-current={active || undefined}
                      className={cn(
                        "w-full rounded-2xl border p-4 text-left transition-colors",
                        active ? "border-ink-900 bg-elevated shadow-card" : "border-line bg-elevated hover:border-line-strong",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-ink-950">{reason(d.reason)}</span>
                        {d.state === "open" ? (
                          <Due dispute={d} hours={config.disputes.responseHours} now={now} />
                        ) : (
                          <Badge tone={d.state === "refunded" ? "maroon" : "success"}>
                            {d.state === "refunded" ? "Refunded" : "Released"}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-[13px] text-ink-700">{o?.title}</p>
                      <p className="mt-1.5 flex items-center justify-between text-xs text-ink-500">
                        <span>
                          {d.id} · {o && formatCedi(o.amount)}
                        </span>
                        <RelativeTime at={d.openedAt} />
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={cn(!selected && "hidden lg:block")}>
          <AnimatePresence mode="wait">
            {current ? (
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <button
                  type="button"
                  onClick={() => setSelected("")}
                  className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-ink-700 lg:hidden"
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  All disputes
                </button>
                <DisputeDetail dispute={current} reason={reason(current.reason)} hours={config.disputes.responseHours} now={now} />
              </motion.div>
            ) : (
              <Card>
                <EmptyState icon={Gavel} title="Pick a dispute" body="Select a dispute to see both sides and decide." />
              </Card>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

function DisputeDetail({ dispute: d, reason, hours, now }: { dispute: AdminDispute; reason: string; hours: number; now: number }) {
  const s = useAdmin();
  const canResolve = useCan("disputes.resolve");
  const [note, setNote] = useState("");
  const o = s.orders.find((x) => x.id === d.orderId);

  const resolve = (outcome: "refunded" | "released") =>
    perform(
      (st, t) => resolveDispute(st, d.id, outcome, note.trim(), t),
      outcome === "refunded" ? "Buyer refunded" : "Payout released to seller",
    ) && setNote("");

  return (
    <Card>
      <div className="border-b border-line p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-950">{reason}</h2>
          {d.state === "open" && <Due dispute={d} hours={hours} now={now} />}
        </div>
        {o && (
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-4">
            {[
              ["Item", o.title],
              ["Amount", formatCedi(o.amount)],
              ["Buyer", o.buyer],
              ["Seller", o.seller],
              ["Order", o.id],
              ["Paid with", o.method],
              ["Pickup", o.pickup],
              ["Opened", clock.format(d.openedAt)],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-ink-500">{k}</dt>
                <dd className="truncate font-medium text-ink-900">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <ol className="space-y-4 p-5">
        {d.messages.map((m, i) => (
          <li key={i} className={cn("flex gap-3", m.from === "admin" && "flex-row-reverse")}>
            <Avatar name={m.name} size={32} />
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-3.5 py-2.5",
                m.from === "admin" ? "bg-ink-950 text-canvas" : "bg-surface text-ink-900",
              )}
            >
              <p className={cn("text-xs font-medium", m.from === "admin" ? "text-canvas/70" : "text-ink-500")}>
                {m.name} · {m.from === "admin" ? "Admin" : m.from === "buyer" ? "Buyer" : "Seller"}
              </p>
              <p className="mt-0.5 text-[13.5px] leading-relaxed">{m.text}</p>
            </div>
          </li>
        ))}
      </ol>

      {d.state === "open" ? (
        canResolve ? (
          <div className="border-t border-line p-5">
            <label htmlFor="note" className="text-[13px] font-medium text-ink-900">
              Decision note
            </label>
            <TextArea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain the decision. Both students will see this."
              className="mt-1.5"
              maxLength={500}
            />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => resolve("released")} className={buttonClass("outline", "md")}>
                <Wallet className="size-4" aria-hidden />
                Release to seller
              </button>
              <button type="button" onClick={() => resolve("refunded")} className={buttonClass("primary", "md")}>
                <Undo2 className="size-4" aria-hidden />
                Refund buyer
              </button>
            </div>
          </div>
        ) : (
          <p className="border-t border-line p-5 text-[13px] text-ink-500">
            You can view this dispute, but resolving it needs the disputes.resolve permission.
          </p>
        )
      ) : (
        d.resolution && (
          <div className="flex items-center gap-2 border-t border-line p-5 text-[13px] text-ink-700">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            {d.state === "refunded" ? "Buyer refunded" : "Released to seller"} by{" "}
            <span className="font-medium text-ink-950">{d.resolution.by}</span>
            <RelativeTime at={d.resolution.at} className="text-ink-500" />
          </div>
        )
      )}
    </Card>
  );
}
