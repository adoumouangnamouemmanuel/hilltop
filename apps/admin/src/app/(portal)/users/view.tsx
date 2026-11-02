"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, BadgeX, Ban, Download, RotateCcw, Trash2, Users } from "lucide-react";
import { Avatar, buttonClass, Verified } from "@hilltop/ui/ui";
import { Badge, Card, Confirm, EmptyState, Gate, PageHeader, SearchField, Segmented, Table, Td, Th } from "@/components/kit";
import { useDetail } from "@/components/details";
import { RowMenu } from "@/components/row-menu";
import { deleteUser, setSuspended, setVerified } from "@/lib/model";
import { perform, useAdmin, useCan } from "@/lib/store";
import { downloadCsv } from "@/lib/csv";
import { useQueryState } from "@/lib/use-query";
import type { AdminUser } from "@/lib/types";

type View = "all" | "unverified" | "suspended" | "sellers";

const filters: Record<View, (u: AdminUser) => boolean> = {
  all: () => true,
  unverified: (u) => !u.verified,
  suspended: (u) => u.status === "suspended",
  sellers: (u) => u.listings > 0,
};

const joined = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });

export function UsersView() {
  return (
    <Gate permission="users.view">
      <UsersInner />
    </Gate>
  );
}

function UsersInner() {
  const s = useAdmin();
  const [view, setView] = useQueryState<View>("view", "all");
  const [q, setQ] = useQueryState<string>("q", "");
  const [confirm, setConfirm] = useState<{ user: AdminUser; kind: "suspend" | "delete" } | null>(null);
  const canVerify = useCan("users.verify");
  const canSuspend = useCan("users.suspend");
  const canDelete = useCan("users.delete");
  const detail = useDetail();

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return s.users
      .filter(filters[view])
      .filter((u) => !term || `${u.name} ${u.email} ${u.major ?? ""} ${u.specialty ?? ""}`.toLowerCase().includes(term));
  }, [s.users, view, q]);

  const actions = (u: AdminUser) => [
    {
      label: u.verified ? "Remove verification" : "Verify student",
      icon: u.verified ? BadgeX : BadgeCheck,
      hidden: !canVerify,
      onClick: () =>
        perform((st, now) => setVerified(st, u.id, !u.verified, now), u.verified ? "Verification removed" : `${u.name} verified`),
    },
    u.status === "suspended"
      ? {
          label: "Reinstate",
          icon: RotateCcw,
          hidden: !canSuspend,
          onClick: () => perform((st, now) => setSuspended(st, u.id, false, now), `${u.name} reinstated`),
        }
      : { label: "Suspend", icon: Ban, hidden: !canSuspend, danger: true, onClick: () => setConfirm({ user: u, kind: "suspend" }) },
    { label: "Delete account", icon: Trash2, hidden: !canDelete, danger: true, onClick: () => setConfirm({ user: u, kind: "delete" }) },
  ];

  const status = (u: AdminUser) =>
    u.status === "suspended" ? (
      <Badge tone="maroon" dot>
        Suspended
      </Badge>
    ) : u.verified ? (
      <Badge tone="success" dot>
        Active
      </Badge>
    ) : (
      <Badge tone="warning" dot>
        Unverified
      </Badge>
    );

  return (
    <>
      <PageHeader title="Users" description="Every student on the marketplace. Verify new sign-ups and act on reports.">
        <button
          type="button"
          className={buttonClass("outline", "sm")}
          onClick={() =>
            downloadCsv(
              "users.csv",
              rows.map((u) => ({
                name: u.name,
                email: u.email,
                classOf: u.classOf,
                major: u.major,
                status: u.status,
                verified: u.verified,
                listings: u.listings,
                sales: u.sales,
                purchases: u.purchases,
              })),
            )
          }
        >
          <Download className="size-4" aria-hidden />
          Export
        </button>
      </PageHeader>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented
          label="Filter users"
          value={view}
          onChange={setView}
          options={[
            { id: "all", label: "All", count: s.users.length },
            { id: "unverified", label: "Unverified", count: s.users.filter(filters.unverified).length },
            { id: "suspended", label: "Suspended", count: s.users.filter(filters.suspended).length },
            { id: "sellers", label: "Sellers", count: s.users.filter(filters.sellers).length },
          ]}
        />
        <SearchField value={q} onChange={setQ} placeholder="Search name, email or major" className="md:w-80" />
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No users match" body="Try another filter or search." />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>Student</Th>
                    <Th>Programme or shop</Th>
                    <Th>Status</Th>
                    <Th align="right">Listings</Th>
                    <Th align="right">Sales</Th>
                    <Th align="right">Reports</Th>
                    <Th>Joined</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => detail.open("user", u.id)}
                      className="cursor-pointer transition-colors hover:bg-surface/60"
                    >
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} size={34} />
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                detail.open("user", u.id);
                              }}
                              className="flex items-center gap-1 text-left font-medium text-ink-950 hover:underline"
                            >
                              {u.name} {u.verified && <Verified />}
                            </button>
                            <p className="truncate text-xs text-ink-500">{u.email}</p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <p className="text-ink-900">{u.major ?? u.specialty ?? "Not added"}</p>
                        {u.classOf && <p className="text-xs text-ink-500">Class of {u.classOf}</p>}
                      </Td>
                      <Td>{status(u)}</Td>
                      <Td align="right">{u.listings}</Td>
                      <Td align="right">{u.sales}</Td>
                      <Td align="right">{u.reports ? <span className="font-medium text-maroon-700">{u.reports}</span> : 0}</Td>
                      <Td className="whitespace-nowrap">{joined.format(u.joinedAt)}</Td>
                      <Td align="right">
                        <div onClick={(e) => e.stopPropagation()}>
                          <RowMenu label={u.name} actions={actions(u)} />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-4 py-3.5">
                  <Avatar name={u.name} size={40} />
                  <button type="button" onClick={() => detail.open("user", u.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-1 truncate text-[14px] font-medium text-ink-950">
                      {u.name} {u.verified && <Verified />}
                    </span>
                    <span className="block truncate text-xs text-ink-500">
                      {u.major ? `${u.major}${u.classOf ? ` · ${u.classOf}` : ""}` : u.specialty}
                    </span>
                    <span className="mt-1.5 block">{status(u)}</span>
                  </button>
                  <RowMenu label={u.name} actions={actions(u)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        danger
        title={confirm?.kind === "delete" ? `Delete ${confirm.user.name}?` : `Suspend ${confirm?.user.name}?`}
        body={
          confirm?.kind === "delete"
            ? "Everything that's theirs is deleted: sign-in, email, listings and photos, chats, offers, reviews, reports, saved items and notifications, and their name in the audit log. Orders stay for the other student, without their name. This can't be undone."
            : "They won't be able to buy, sell or message, and their live listings are hidden. You can reinstate them later."
        }
        confirmLabel={confirm?.kind === "delete" ? "Delete account" : "Suspend"}
        onConfirm={() => {
          if (!confirm) return;
          const { user, kind } = confirm;
          if (kind === "delete") perform((st, now) => deleteUser(st, user.id, now), `${user.name} deleted`);
          else perform((st, now) => setSuspended(st, user.id, true, now), `${user.name} suspended`);
        }}
      />
    </>
  );
}
