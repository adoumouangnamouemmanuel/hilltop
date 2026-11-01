import { diffConfig, type PlatformConfig } from "@hilltop/shared/config";
import { can, OWNER_ROLE, type Permission, type Role } from "@hilltop/shared/permissions";
import type { AdminState, AuditEntry, DisputeState, ListingState, Member } from "./types";

/*
 * Pure admin state transitions. Each one checks the acting member's permission
 * and appends an audit entry, so the rules are testable without a browser and
 * every screen gets the same enforcement for free.
 */

export class Forbidden extends Error {
  constructor(public permission: Permission) {
    super(`Missing permission: ${permission}`);
  }
}

export class Rejected extends Error {}

export function sessionMember(s: AdminState): Member | undefined {
  return s.team.find((m) => m.id === s.sessionId && m.status === "active");
}

export function memberRole(s: AdminState, m: Member | undefined): Role | undefined {
  return m && s.roles.find((r) => r.id === m.roleId);
}

export function allowed(s: AdminState, permission: Permission) {
  return can(memberRole(s, sessionMember(s)), permission);
}

let seq = 0;
const nextId = (prefix: string, now: number) => `${prefix}-${now.toString(36)}-${(seq++).toString(36)}`;

/** Runs `change` as the signed-in member if they hold `permission`, and logs it. */
export function act(
  s: AdminState,
  permission: Permission,
  entry: { action: string; target?: string },
  now: number,
  change: (s: AdminState) => AdminState,
): AdminState {
  const me = sessionMember(s);
  if (!me || !can(memberRole(s, me), permission)) throw new Forbidden(permission);
  const next = change(s);
  const log: AuditEntry = { id: nextId("a", now), at: now, actor: me.name, permission, ...entry };
  return { ...next, audit: [log, ...next.audit].slice(0, 500) };
}

const owners = (s: AdminState) => s.team.filter((m) => m.roleId === OWNER_ROLE && m.status === "active");

// Users

export const setVerified = (s: AdminState, id: string, verified: boolean, now: number) =>
  act(s, "users.verify", { action: verified ? "Verified student" : "Removed verification", target: name(s, id) }, now, (s) => ({
    ...s,
    users: s.users.map((u) => (u.id === id ? { ...u, verified } : u)),
  }));

export const setSuspended = (s: AdminState, id: string, suspended: boolean, now: number) =>
  act(s, "users.suspend", { action: suspended ? "Suspended user" : "Reinstated user", target: name(s, id) }, now, (s) => ({
    ...s,
    users: s.users.map((u) => (u.id === id ? { ...u, status: suspended ? "suspended" : "active" } : u)),
    // A suspended seller's listings come down with them.
    listings: suspended ? s.listings.map((l) => (l.sellerId === id && l.state === "live" ? { ...l, state: "hidden" } : l)) : s.listings,
  }));

export const deleteUser = (s: AdminState, id: string, now: number) =>
  act(s, "users.delete", { action: "Deleted user", target: name(s, id) }, now, (s) => ({
    ...s,
    users: s.users.filter((u) => u.id !== id),
    listings: s.listings.map((l) => (l.sellerId === id ? { ...l, state: "removed" } : l)),
  }));

const name = (s: AdminState, userId: string) => s.users.find((u) => u.id === userId)?.name ?? userId;

// Listings

const stateLabels: Record<ListingState, string> = {
  live: "Restored listing",
  hidden: "Hid listing",
  removed: "Removed listing",
  sold: "Marked sold",
};

export const setListingState = (s: AdminState, id: string, state: ListingState, now: number) =>
  act(s, "listings.moderate", { action: stateLabels[state], target: title(s, id) }, now, (s) => ({
    ...s,
    // Acting on a listing resolves its open reports.
    listings: s.listings.map((l) => (l.id === id ? { ...l, state, reports: [] } : l)),
  }));

export const dismissReports = (s: AdminState, id: string, now: number) =>
  act(s, "listings.moderate", { action: "Dismissed reports", target: title(s, id) }, now, (s) => ({
    ...s,
    listings: s.listings.map((l) => (l.id === id ? { ...l, reports: [] } : l)),
  }));

const title = (s: AdminState, id: string) => s.listings.find((l) => l.id === id)?.title ?? id;

// Orders and disputes

export function refundOrder(s: AdminState, id: string, now: number) {
  const order = s.orders.find((o) => o.id === id);
  if (order?.payment === "pickup") throw new Rejected("This order was paid at pickup, so Hilltop holds nothing to refund.");
  if (!order || order.status === "refunded" || order.status === "collected") throw new Rejected("This order can't be refunded.");
  return act(s, "orders.refund", { action: "Refunded order", target: id }, now, (s) => ({
    ...s,
    orders: s.orders.map((o) => (o.id === id ? { ...o, status: "refunded" } : o)),
  }));
}

export function releaseOrder(s: AdminState, id: string, now: number) {
  const order = s.orders.find((o) => o.id === id);
  if (order?.payment === "pickup") throw new Rejected("This order was paid at pickup, so there's no payout to release.");
  if (!order || order.status === "refunded" || order.status === "collected") throw new Rejected("This payout was already settled.");
  return act(s, "orders.refund", { action: "Released payout", target: id }, now, (s) => ({
    ...s,
    orders: s.orders.map((o) => (o.id === id ? { ...o, status: "collected" } : o)),
  }));
}

export function resolveDispute(s: AdminState, id: string, outcome: Exclude<DisputeState, "open">, note: string, now: number) {
  const dispute = s.disputes.find((d) => d.id === id);
  if (!dispute || dispute.state !== "open") throw new Rejected("This dispute is already resolved.");
  const me = sessionMember(s);
  return act(s, "disputes.resolve", { action: outcome === "refunded" ? "Refunded buyer" : "Released to seller", target: id }, now, (s) => ({
    ...s,
    disputes: s.disputes.map((d) =>
      d.id === id
        ? {
            ...d,
            state: outcome,
            resolution: { by: me?.name ?? "Admin", at: now, note },
            messages: note ? [...d.messages, { from: "admin" as const, name: me?.name ?? "Admin", text: note, at: now }] : d.messages,
          }
        : d,
    ),
    orders: s.orders.map((o) => (o.id === dispute.orderId ? { ...o, status: outcome === "refunded" ? "refunded" : "collected" } : o)),
  }));
}

// Team and roles

export function inviteMember(s: AdminState, input: { name: string; email: string; roleId: string }, now: number) {
  const email = input.email.trim().toLowerCase();
  if (s.team.some((m) => m.email === email)) throw new Rejected("Someone with that email is already on the team.");
  if (!s.roles.some((r) => r.id === input.roleId)) throw new Rejected("Pick a role.");
  return act(s, "team.manage", { action: "Invited admin", target: input.name }, now, (s) => ({
    ...s,
    team: [...s.team, { id: nextId("m", now), name: input.name.trim(), email, roleId: input.roleId, status: "invited", invitedAt: now }],
  }));
}

export function changeMemberRole(s: AdminState, id: string, roleId: string, now: number) {
  const member = s.team.find((m) => m.id === id);
  if (!member) throw new Rejected("Member not found.");
  if (member.roleId === OWNER_ROLE && roleId !== OWNER_ROLE && owners(s).length <= 1 && member.status === "active")
    throw new Rejected("The team needs at least one owner.");
  const role = s.roles.find((r) => r.id === roleId);
  if (!role) throw new Rejected("Role not found.");
  return act(s, "team.manage", { action: `Changed role to ${role.name}`, target: member.name }, now, (s) => ({
    ...s,
    team: s.team.map((m) => (m.id === id ? { ...m, roleId } : m)),
  }));
}

export function removeMember(s: AdminState, id: string, now: number) {
  const member = s.team.find((m) => m.id === id);
  if (!member) throw new Rejected("Member not found.");
  if (member.id === s.sessionId) throw new Rejected("You can't remove yourself.");
  if (member.roleId === OWNER_ROLE && owners(s).length <= 1 && member.status === "active")
    throw new Rejected("The team needs at least one owner.");
  return act(s, "team.manage", { action: "Removed admin", target: member.name }, now, (s) => ({
    ...s,
    team: s.team.filter((m) => m.id !== id),
  }));
}

export function saveRole(s: AdminState, role: Role, now: number) {
  if (!role.name.trim()) throw new Rejected("Give the role a name.");
  const exists = s.roles.some((r) => r.id === role.id);
  return act(s, "team.manage", { action: exists ? "Updated role" : "Created role", target: role.name }, now, (s) => ({
    ...s,
    // The owner role always keeps every permission.
    roles: exists
      ? s.roles.map((r) => (r.id === role.id ? (r.id === OWNER_ROLE ? { ...r, name: role.name, description: role.description } : role) : r))
      : [...s.roles, role],
  }));
}

export function deleteRole(s: AdminState, id: string, fallbackId: string, now: number) {
  const role = s.roles.find((r) => r.id === id);
  if (!role) throw new Rejected("Role not found.");
  if (role.system) throw new Rejected("Built-in roles can't be deleted.");
  if (!s.roles.some((r) => r.id === fallbackId) || fallbackId === id) throw new Rejected("Pick a role for its members.");
  return act(s, "team.manage", { action: "Deleted role", target: role.name }, now, (s) => ({
    ...s,
    roles: s.roles.filter((r) => r.id !== id),
    team: s.team.map((m) => (m.roleId === id ? { ...m, roleId: fallbackId } : m)),
  }));
}

export const newRoleId = (label: string, roles: Role[]) => {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "role";
  let id = base;
  for (let i = 2; roles.some((r) => r.id === id); i++) id = `${base}-${i}`;
  return id;
};

// Platform config drafts

/**
 * Applies an edit to the draft config (starting from the published one). When the
 * result matches what's published, the draft is cleared.
 */
export function editDraft(
  s: AdminState,
  published: PlatformConfig,
  permission: "settings.edit" | "catalog.edit" | "listings.feature",
  action: string,
  update: (c: PlatformConfig) => PlatformConfig,
  now: number,
) {
  return act(s, permission, { action }, now, (s) => {
    const next = update(s.draft ?? published);
    return { ...s, draft: diffConfig(published, next).length ? next : null };
  });
}

export const discardDraft = (s: AdminState, now: number) =>
  act(s, "settings.edit", { action: "Discarded unpublished changes" }, now, (s) => ({ ...s, draft: null }));

export const recordPublish = (s: AdminState, version: number, note: string, now: number) =>
  act(s, "settings.publish", { action: `Published config v${version}`, target: note || undefined }, now, (s) => ({ ...s, draft: null }));
