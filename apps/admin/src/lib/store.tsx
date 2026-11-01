"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { PlatformConfig } from "@hilltop/shared/config";
import type { Permission } from "@hilltop/shared/permissions";
import { toast } from "@hilltop/ui/toast";
import { allowed, Forbidden, memberRole, Rejected, sessionMember } from "./model";
import type { Release } from "./release";
import { seedState } from "./seed";
import type { AdminState } from "./types";

/*
 * Client store for the portal. Operational data and the team are mock data kept
 * in localStorage (and synced across tabs); the published config and its history
 * come from the server. Every write goes through `perform`, which surfaces
 * permission and validation errors as toasts.
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
  try {
    setState(change(getState(), Date.now()));
    if (success) toast(success, { tone: "success" });
    return true;
  } catch (e) {
    if (e instanceof Forbidden) toast("You don't have permission to do that.");
    else if (e instanceof Rejected) toast(e.message);
    else throw e;
    return false;
  }
}

export function signIn(memberId: string) {
  const s = getState();
  const member = s.team.find((m) => m.id === memberId);
  if (!member) return false;
  const now = Date.now();
  setState({
    ...s,
    sessionId: memberId,
    // Signing in for the first time accepts the invite.
    team: s.team.map((m) => (m.id === memberId ? { ...m, status: "active", lastActiveAt: now } : m)),
    audit: [
      { id: `a-${now.toString(36)}`, at: now, actor: member.name, permission: "session" as const, action: "Signed in" },
      ...s.audit,
    ].slice(0, 500),
  });
  return true;
}

export function signOut() {
  setState({ ...getState(), sessionId: null });
}

/** Restores the demo data. Keeps the current session so the admin isn't kicked out. */
export function resetDemo() {
  const sessionId = getState().sessionId;
  setState({ ...seedState(Date.now()), sessionId });
}

export function useSession() {
  const s = useAdmin();
  const member = sessionMember(s);
  return { member, role: memberRole(s, member) };
}

export function useCan(permission: Permission) {
  return allowed(useAdmin(), permission);
}

// Published config, provided by the server layout.

type Published = { config: PlatformConfig; releases: Release[]; accessKeyRequired: boolean };

const PublishedContext = createContext<Published | null>(null);

export function PublishedProvider({ value, children }: { value: Published; children: React.ReactNode }) {
  return <PublishedContext value={value}>{children}</PublishedContext>;
}

export function usePublished() {
  const v = useContext(PublishedContext);
  if (!v) throw new Error("usePublished must be used inside PublishedProvider");
  return v;
}

/** The config being edited: the draft if there is one, otherwise what's live. */
export function useWorkingConfig() {
  const { config } = usePublished();
  const { draft } = useAdmin();
  return draft ?? config;
}
