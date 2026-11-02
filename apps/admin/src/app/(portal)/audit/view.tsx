"use client";

import { useMemo } from "react";
import { Download, ScrollText } from "lucide-react";
import { permissionGroups } from "@hilltop/shared/permissions";
import { Avatar, buttonClass } from "@hilltop/ui/ui";
import { Badge, Card, EmptyState, Gate, PageHeader, SearchField, Select } from "@/components/kit";
import { downloadCsv } from "@/lib/csv";
import { useAuditLog } from "@/lib/audit";
import { useQueryState } from "@/lib/use-query";

const when = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dayKey = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

export function AuditView() {
  return (
    <Gate permission="audit.view">
      <AuditInner />
    </Gate>
  );
}

function AuditInner() {
  const { entries } = useAuditLog();
  const [q, setQ] = useQueryState<string>("q", "");
  const [actor, setActor] = useQueryState<string>("actor", "");
  const [area, setArea] = useQueryState<string>("area", "");

  const actors = [...new Set(entries.map((a) => a.actor))].sort();
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return entries
      .filter((a) => !actor || a.actor === actor)
      .filter((a) => !area || a.permission.split(".")[0] === area)
      .filter((a) => !term || `${a.action} ${a.target ?? ""} ${a.actor}`.toLowerCase().includes(term));
  }, [entries, q, actor, area]);

  const days = useMemo(() => {
    const out: { day: string; items: typeof rows }[] = [];
    for (const r of rows) {
      const d = dayKey.format(r.at);
      if (out.at(-1)?.day === d) out.at(-1)!.items.push(r);
      else out.push({ day: d, items: [r] });
    }
    return out;
  }, [rows]);

  return (
    <>
      <PageHeader title="Audit log" description="Every action taken in the portal, by whom and when. Entries can't be edited or deleted.">
        <button
          type="button"
          className={buttonClass("outline", "sm")}
          onClick={() =>
            downloadCsv(
              "audit-log.csv",
              rows.map((a) => ({
                at: new Date(a.at).toISOString(),
                actor: a.actor,
                action: a.action,
                target: a.target ?? "",
                permission: a.permission,
              })),
            )
          }
        >
          <Download className="size-4" aria-hidden />
          Export
        </button>
      </PageHeader>
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
        <SearchField value={q} onChange={setQ} placeholder="Search actions and targets" />
        <Select aria-label="Admin" value={actor} onChange={(e) => setActor(e.target.value)}>
          <option value="">Everyone</option>
          {actors.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </Select>
        <Select aria-label="Area" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">All areas</option>
          {Object.keys(permissionGroups).map((g) => (
            <option key={g} value={g.toLowerCase()}>
              {g}
            </option>
          ))}
          <option value="session">Sign-ins</option>
        </Select>
      </div>
      {days.length === 0 ? (
        <Card>
          <EmptyState icon={ScrollText} title="No matching entries" />
        </Card>
      ) : (
        <div className="space-y-5">
          {days.map(({ day, items }) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-semibold tracking-wider text-ink-500 uppercase">{day}</h2>
              <Card>
                <ol className="divide-y divide-line">
                  {items.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                      <Avatar name={a.actor} size={30} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] text-ink-700">
                          <span className="font-medium text-ink-950">{a.actor}</span> {a.action.charAt(0).toLowerCase() + a.action.slice(1)}
                          {a.target && <span className="font-medium text-ink-950"> {a.target}</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-400">{when.format(a.at)}</p>
                      </div>
                      <Badge tone="muted" className="hidden font-mono sm:inline-flex">
                        {a.permission}
                      </Badge>
                    </li>
                  ))}
                </ol>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
