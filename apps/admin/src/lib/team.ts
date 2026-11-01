"use client";

import { useCallback, useEffect, useState } from "react";
import { OWNER_ROLE, type Permission, type Role } from "@hilltop/shared/permissions";
import { toast } from "@hilltop/ui/toast";
import { recordAudit } from "./audit";
import { supabase } from "./supabase";
import type { Member } from "./types";

/*
 * The admin team and roles, from the database. Row-level security only lets
 * people with team.manage change them, and database rules keep at least one
 * active owner and protect built-in roles; their messages are shown as toasts.
 */

type Result = { ok: true } | { ok: false };
type DbError = { message?: string; code?: string } | null;

function fail(error: DbError, fallback: string): Result {
  const text = error?.message ?? "";
  if (/at least one active owner/i.test(text)) toast("The team needs at least one owner.");
  else if (/Built-in roles/i.test(text)) toast(text);
  else if (error?.code === "23505") toast("Someone with that email is already on the team.");
  else if (error?.code === "42501") toast("You don't have permission to do that.");
  else toast(fallback);
  return { ok: false };
}

async function loadTeam(): Promise<{ members: Member[]; roles: Role[] }> {
  const client = supabase();
  if (!client) return { members: [], roles: [] };
  const [m, r] = await Promise.all([
    client.from("admin_members").select("id, name, email, role_id, status, invited_at, last_active_at").order("invited_at"),
    client.from("admin_roles").select("id, name, description, permissions, system").order("created_at"),
  ]);
  return {
    members: (m.data ?? []).map((x) => ({
      id: x.id,
      name: x.name,
      email: x.email,
      roleId: x.role_id,
      status: x.status,
      invitedAt: Date.parse(x.invited_at),
      lastActiveAt: x.last_active_at ? Date.parse(x.last_active_at) : undefined,
    })),
    roles: (r.data ?? []).map((x) => ({ ...x, permissions: x.permissions as Permission[] })),
  };
}

export function useTeam() {
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loaded, setLoaded] = useState(false);

  const apply = useCallback((next: { members: Member[]; roles: Role[] }) => {
    setMembers(next.members);
    setRoles(next.roles);
    setLoaded(true);
  }, []);

  const refresh = useCallback(async () => apply(await loadTeam()), [apply]);

  useEffect(() => {
    let live = true;
    loadTeam().then((next) => live && apply(next));
    return () => {
      live = false;
    };
  }, [apply]);

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;

  async function run(write: PromiseLike<{ error: DbError }>, audit: { action: string; target?: string }, fallback: string) {
    const { error } = await write;
    if (error) return fail(error, fallback);
    recordAudit("team.manage", audit.action, audit.target);
    await refresh();
    return { ok: true } as Result;
  }

  const db = () => supabase()!;

  return {
    members,
    roles,
    loaded,
    refresh,
    invite: (input: { name: string; email: string; roleId: string }) =>
      run(
        db().from("admin_members").insert({ name: input.name.trim(), email: input.email.trim().toLowerCase(), role_id: input.roleId }),
        { action: "Invited admin", target: input.name.trim() },
        "Couldn't send the invite.",
      ),
    changeRole: (member: Member, roleId: string) =>
      run(
        db().from("admin_members").update({ role_id: roleId }).eq("id", member.id),
        { action: `Changed role to ${roleName(roleId)}`, target: member.name },
        "Couldn't change the role.",
      ),
    remove: (member: Member) =>
      run(
        db().from("admin_members").delete().eq("id", member.id),
        { action: "Removed admin", target: member.name },
        "Couldn't remove them.",
      ),
    saveRole: (role: Role, isNew: boolean) =>
      run(
        isNew
          ? db().from("admin_roles").insert({ id: role.id, name: role.name, description: role.description, permissions: role.permissions })
          : db()
              .from("admin_roles")
              .update({ name: role.name, description: role.description, permissions: role.permissions })
              .eq("id", role.id),
        { action: isNew ? "Created role" : "Updated role", target: role.name },
        "Couldn't save the role.",
      ),
    togglePermission: (role: Role, permission: Permission) => {
      if (role.id === OWNER_ROLE) return Promise.resolve({ ok: false } as Result);
      const has = role.permissions.includes(permission);
      const permissions = has ? role.permissions.filter((p) => p !== permission) : [...role.permissions, permission];
      return run(
        db().from("admin_roles").update({ permissions }).eq("id", role.id),
        { action: `${has ? "Removed" : "Granted"} ${permission}`, target: role.name },
        "Couldn't update the permission.",
      );
    },
    deleteRole: async (role: Role, fallbackId: string) => {
      const moved = await db().from("admin_members").update({ role_id: fallbackId }).eq("role_id", role.id);
      if (moved.error) return fail(moved.error, "Couldn't move the role's members.");
      return run(
        db().from("admin_roles").delete().eq("id", role.id),
        { action: "Deleted role", target: role.name },
        "Couldn't delete the role.",
      );
    },
  };
}
