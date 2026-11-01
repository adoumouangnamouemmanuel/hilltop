"use client";

import { useSyncExternalStore } from "react";
import type { PlatformConfig } from "@hilltop/shared/config";
import type { Json } from "@hilltop/shared/database.types";
import type { Role } from "@hilltop/shared/permissions";
import { toast } from "@hilltop/ui/toast";
import { Forbidden, Rejected } from "./model";
import { seedState } from "./seed";
import { usePublished, type SessionMember } from "./session";
import { supabase } from "./supabase";
import type { AdminState } from "./types";

/*
 * Client store for the portal's demo data (users, listings, orders, disputes),
 * kept in localStorage and synced across tabs. The session, team, published
 * config and audit log come from Supabase (see session.tsx). Every write goes
 * through `perform`, which surfaces permission and validation errors as toasts.
 */

// Cached operational records must be reseeded when the demo catalog changes.
const KEY = "hilltop-admin-v2-ashesi";
let state: AdminState | null = null;
const listeners = new Set<() => void>();

function load(): AdminState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AdminState;
      if (Array.isArray(parsed.team) && Array.isArray(parsed.roles) && Array.isArray(parsed.orders)) return migrate(parsed);
    }
  } catch {
    // Corrupt or blocked storage: start from the seed.
  }
  return seedState(Date.now());
}

/** Fills in fields added since the data was saved. Orders from before payment options were all protected. */
function migrate(s: AdminState): AdminState {
  return {
    ...s,
    orders: s.orders.map((o) => ({ ...o, payment: o.payment ?? "protected", paidInApp: o.paidInApp ?? o.amount + o.fee })),
    // "featured" used to be a local flag; it now means the seller's paid promotion.
    listings: s.listings.map((l) => ({ ...l, promoted: l.promoted ?? !!(l as { featured?: boolean }).featured })),
  };
}

function getState() {
  return (state ??= load());
}

function setState(next: AdminState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: changes last for this tab only.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    state = load();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

let serverSnapshot: AdminState | null = null;
const getServerState = () => (serverSnapshot ??= seedState(0));

const noop = () => () => {};

/** False during server render and hydration, true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export function useAdmin(): AdminState {
  return useSyncExternalStore(subscribe, getState, getServerState);
}

/** Applies a model transition. Returns whether it went through. */
export function perform(change: (s: AdminState, now: number) => AdminState, success?: string) {
  const before = getState();
  try {
    const next = change(before, Date.now());
    setState(next);
    void syncToDatabase(before, next);
    if (success) toast(success, { tone: "success" });
    return true;
  } catch (e) {
    if (e instanceof Forbidden) toast("You don't have permission to do that.");
    else if (e instanceof Rejected) toast(e.message);
    else throw e;
    return false;
  }
}

/*
 * Until the rest of the portal moves to the database (users, listings, orders and
 * disputes are still demo data), the model's permission checks run against the
 * signed-in admin's real role, and two things are saved for real: the shared
 * config draft and the audit log.
 */

/** Puts the signed-in admin and their role into the local model, so its checks use real permissions. */
export function adoptSession(member: SessionMember, role: Role) {
  const s = getState();
  if (s.sessionId === member.id && s.roles.some((r) => r.id === role.id && r.permissions.join() === role.permissions.join())) return;
  setState({
    ...s,
    sessionId: member.id,
    roles: [role, ...s.roles.filter((r) => r.id !== role.id)],
    team: [
      { id: member.id, name: member.name, email: member.email, roleId: role.id, status: "active", invitedAt: Date.now() },
      ...s.team.filter((m) => m.id !== member.id && m.email !== member.email),
    ],
  });
}

/** Loads the shared draft from the database into the local model. */
export function adoptDraft(draft: PlatformConfig | null) {
  const s = getState();
  if (JSON.stringify(s.draft) === JSON.stringify(draft)) return;
  setState({ ...s, draft });
}

async function syncToDatabase(before: AdminState, after: AdminState) {
  const client = supabase();
  if (!client) return;
  if (after.draft !== before.draft) {
    const { error } = await (after.draft
      ? // The row's id is fixed by the table (a single draft), so only the config is sent.
        client.from("config_draft").upsert({ config: after.draft as unknown as { [key: string]: Json } }, { onConflict: "id" })
      : client.from("config_draft").delete().eq("id", true));
    // Nothing changed, so nothing goes in the audit log.
    if (error) return toast("Couldn't save the draft. Check your connection and try again.");
  }
  const entry = after.audit[0];
  if (entry && entry.id !== before.audit[0]?.id) {
    const { error } = await client
      .from("audit_log")
      .insert({ permission: entry.permission, action: entry.action, target: entry.target ?? null, actor_name: entry.actor });
    if (error) console.error("Audit entry not saved", error);
  }
}

/** Restores the demo data. Keeps the current session so the admin isn't kicked out. */
export function resetDemo() {
  const { sessionId, roles, team, draft } = getState();
  setState({ ...seedState(Date.now()), sessionId, roles, team, draft });
}

export { useCan, usePublished, useSession } from "./session";

/** The config being edited: the draft if there is one, otherwise what's live. */
export function useWorkingConfig() {
  const { config } = usePublished();
  const { draft } = useAdmin();
  return draft ?? config;
}
