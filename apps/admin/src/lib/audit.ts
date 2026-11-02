"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { AuditEntry } from "./types";

/*
 * The audit log lives in the database, which writes every entry itself when an
 * admin changes something (triggers and functions in the audit migration). Entries
 * are attributed to the signed-in admin, sealed with a hash chain, and nobody can
 * write, edit or delete them from the portal.
 */

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
