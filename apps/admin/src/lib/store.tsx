"use client";

import { useSyncExternalStore } from "react";
import type { PlatformConfig } from "@hilltop/shared/config";
import type { Json } from "@hilltop/shared/database.types";
import type { Role } from "@hilltop/shared/permissions";
import { toast } from "@hilltop/ui/toast";
import { Forbidden, Rejected } from "./model";
import { loadOperations, saveOperations, type Operations } from "./operations";
import { seedState } from "./seed";
import { usePublished, type SessionMember } from "./session";
import { supabase } from "./supabase";
import type { AdminState } from "./types";

type Db = NonNullable<ReturnType<typeof supabase>>;

/*
 * Client store for the portal. Students, listings, reports, orders and disputes are
 * loaded from Supabase (operations.ts); the session, team, published config and
 * audit log too (session.tsx). Every change goes through `perform`, which checks
 * the admin's permission, writes it to the database and surfaces problems as
 * toasts. Changes that move money or settle disputes go through `performRemote`,
 * which only shows them once the database has made them. The database writes the
 * audit log itself; the browser never does. Only the shared draft is cached here.
 */

const KEY = "hilltop-admin-v3";

// Operational records come from the database, never from the browser's cache.
const noOperations: Operations = { users: [], listings: [], orders: [], disputes: [] };
let state: AdminState | null = null;
const listeners = new Set<() => void>();

function load(): AdminState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AdminState;
      if (Array.isArray(parsed.team) && Array.isArray(parsed.roles)) return { ...parsed, ...noOperations };
    }
  } catch {
    // Corrupt or blocked storage: start fresh.
  }
  return { ...seedState(Date.now()), ...noOperations };
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
const getServerState = () => (serverSnapshot ??= { ...seedState(0), ...noOperations });

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

/**
 * For changes the database makes itself (refunds, payout releases, settling disputes):
 * the model checks the permission and rules first, then the database function runs,
 * and only when it succeeds does the screen change and the success toast show.
 */
export async function performRemote(
  change: (s: AdminState, now: number) => AdminState,
  remote: (db: Db) => PromiseLike<{ error: { message?: string } | null }>,
  success?: string,
) {
  const before = getState();
  let next: AdminState;
  try {
    next = change(before, Date.now());
  } catch (e) {
    if (e instanceof Forbidden) toast("You don't have permission to do that.");
    else if (e instanceof Rejected) toast(e.message);
    else throw e;
    return false;
  }
  const client = supabase();
  if (!client) {
    toast("Not connected. Check your connection and try again.");
    return false;
  }
  const { error } = await remote(client);
  if (error) {
    toast(error.message || "Couldn't save that change. Try again.");
    void refreshOperations();
    return false;
  }
  setState(next);
  if (success) toast(success, { tone: "success" });
  // What the database stored, including any history it added.
  void refreshOperations();
  return true;
}

let operationsLoadedAt = 0;

/** Loads students, listings, reports, orders and disputes from the database. */
export async function refreshOperations() {
  operationsLoadedAt = Date.now();
  const ops = await loadOperations();
  if (ops) setState({ ...getState(), ...ops });
}

/** Refreshes when the admin comes back to the tab, at most every three minutes (it's seven queries). */
export function refreshOperationsIfStale() {
  if (Date.now() - operationsLoadedAt > 180_000) void refreshOperations();
}

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
  if (before.users !== after.users || before.listings !== after.listings) {
    const error = await saveOperations(before, after);
    // Reload so the screen shows what's really stored.
    if (error) {
      toast(error);
      void refreshOperations();
      return;
    }
  }
  if (after.draft !== before.draft) {
    const { error } = await (after.draft
      ? // The row's id is fixed by the table (a single draft), so only the config is sent.
        client.from("config_draft").upsert({ config: after.draft as unknown as { [key: string]: Json } }, { onConflict: "id" })
      : client.from("config_draft").delete().eq("id", true));
    if (error) return toast("Couldn't save the draft. Check your connection and try again.");
  }
  // The database records each of these changes in the audit log as it makes them.
}

export { useCan, usePublished, useSession } from "./session";

/** The config being edited: the draft if there is one, otherwise what's live. */
export function useWorkingConfig() {
  const { config } = usePublished();
  const { draft } = useAdmin();
  return draft ?? config;
}
