"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { AuditEntry } from "./types";

/*
 * The audit log lives in the database. The server attributes each entry to the
 * signed-in admin (by the name the team knows them by) and nobody can edit or
 * delete entries.
 */

export function recordAudit(permission: string, action: string, target?: string) {
  supabase()
    ?.from("audit_log")
    // actor_name is replaced by the server; it's only required by the table.
    .insert({ permission, action, target: target ?? null, actor_name: "-" })
    .then(({ error }) => error && console.error("Audit entry not saved", error));
}

async function loadAudit(limit: number): Promise<AuditEntry[]> {
  const client = supabase();
  if (!client) return [];
  const { data } = await client
    .from("audit_log")
    .select("id, at, actor_name, permission, action, target")
    .order("id", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    at: Date.parse(r.at),
    actor: r.actor_name,
    permission: r.permission as AuditEntry["permission"],
    action: r.action,
    target: r.target ?? undefined,
  }));
}

export function useAuditLog(limit = 500) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setEntries(await loadAudit(limit));
    setLoaded(true);
  }, [limit]);

  useEffect(() => {
    let live = true;
    const load = () =>
      loadAudit(limit).then((next) => {
        if (!live) return;
        setEntries(next);
        setLoaded(true);
      });
    load();
    // New entries from this or other admins show up when the tab is revisited.
    window.addEventListener("focus", load);
    return () => {
      live = false;
      window.removeEventListener("focus", load);
    };
  }, [limit]);

  return { entries, loaded, refresh };
}
