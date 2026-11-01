"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { configFromRelease, defaultConfig, type PlatformConfig } from "@hilltop/shared/config";
import { can, type Permission, type Role } from "@hilltop/shared/permissions";
import type { Release } from "./release";
import { supabase } from "./supabase";

/*
 * Who's signed in to the portal, from Supabase: the auth session, the admin team
 * row for their email and their role. The database enforces every permission;
 * this is what the portal uses to show or hide controls.
 */

export type SessionMember = { id: string; name: string; email: string; roleId: string };

type Session =
  | { status: "loading" }
  | { status: "signed-out" }
  // Signed in, but not on the admin team (or their invite was removed).
  | { status: "not-admin"; email: string }
  | { status: "ready"; email: string; member: SessionMember; role: Role };

type SessionValue = Session & { refresh: () => Promise<Session>; signOut: () => Promise<void> };

const SessionContext = createContext<SessionValue | null>(null);

async function loadSession(): Promise<Session> {
  const client = supabase();
  if (!client) return { status: "signed-out" };
  const { data } = await client.auth.getSession();
  const email = data.session?.user.email?.toLowerCase();
  if (!email) return { status: "signed-out" };

  const { data: member } = await client.from("admin_members").select("id, name, email, role_id, status").eq("email", email).maybeSingle();
  if (!member || member.status !== "active") return { status: "not-admin", email };

  const { data: role } = await client
    .from("admin_roles")
    .select("id, name, description, permissions, system")
    .eq("id", member.role_id)
    .maybeSingle();
  if (!role) return { status: "not-admin", email };

  return {
    status: "ready",
    email,
    member: { id: member.id, name: member.name, email: member.email, roleId: member.role_id },
    role: { ...role, permissions: role.permissions as Permission[], system: role.system },
  };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading" });

  const refresh = useCallback(async () => {
    const next = await loadSession();
    setSession(next);
    return next;
  }, []);

  useEffect(() => {
    let live = true;
    loadSession().then((next) => live && setSession(next));
    const client = supabase();
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") refresh();
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, [refresh]);

  const signOut = useCallback(async () => {
    await supabase()?.auth.signOut();
    setSession({ status: "signed-out" });
  }, []);

  const value = useMemo(() => ({ ...session, refresh, signOut }), [session, refresh, signOut]);
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useAdminSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useAdminSession must be used inside SessionProvider");
  return value;
}

/** The signed-in admin and their role (undefined while loading or signed out). */
export function useSession() {
  const s = useAdminSession();
  return s.status === "ready" ? { member: s.member, role: s.role } : { member: undefined, role: undefined };
}

export function useCan(permission: Permission) {
  return can(useSession().role, permission);
}

// Published config ----------------------------------------------------------------

type Published = { config: PlatformConfig; releases: Release[]; loaded: boolean; refresh: () => Promise<void> };

const PublishedContext = createContext<Published | null>(null);

async function loadReleases(): Promise<Release[]> {
  const client = supabase();
  if (!client) return [];
  const { data } = await client
    .from("config_releases")
    .select("version, config, published_at, published_by_name, note, changes")
    .order("version", { ascending: false })
    .limit(25);
  return (data ?? []).map((r) => ({
    version: r.version,
    publishedAt: r.published_at,
    by: r.published_by_name ?? "Unknown",
    note: r.note,
    changes: r.changes,
    config: configFromRelease(r).config,
  }));
}

/** Published releases from the database, newest first. Readable by anyone. */
export function PublishedProvider({ children }: { children: React.ReactNode }) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setReleases(await loadReleases());
    setLoaded(true);
  }, []);

  useEffect(() => {
    let live = true;
    loadReleases().then((next) => {
      if (!live) return;
      setReleases(next);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const value = useMemo(() => ({ config: releases[0]?.config ?? defaultConfig, releases, loaded, refresh }), [releases, loaded, refresh]);
  return <PublishedContext value={value}>{children}</PublishedContext>;
}

export function usePublished() {
  const v = useContext(PublishedContext);
  if (!v) throw new Error("usePublished must be used inside PublishedProvider");
  return v;
}
