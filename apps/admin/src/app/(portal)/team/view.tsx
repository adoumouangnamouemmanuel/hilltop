"use client";

import { createContext, useContext, useState } from "react";
import { Check, Lock, Mail, Pencil, Plus, Trash2, UserMinus, UserPlus } from "lucide-react";
import { OWNER_ROLE, permissionGroups, type Permission, type Role } from "@hilltop/shared/permissions";
import { Sheet } from "@hilltop/ui/sheet";
import { RelativeTime } from "@hilltop/ui/controls";
import { Avatar, buttonClass, cn } from "@hilltop/ui/ui";
import { Badge, Card, CardHeader, Confirm, Field, Gate, PageHeader, Segmented, Select, TextInput } from "@/components/kit";
import { RowMenu } from "@/components/row-menu";
import { toast } from "@hilltop/ui/toast";
import { newRoleId } from "@/lib/model";
import { useCan, useSession } from "@/lib/store";
import { useTeam } from "@/lib/team";
import { useQueryState } from "@/lib/use-query";
import type { Member } from "@/lib/types";

type TeamData = ReturnType<typeof useTeam> & { team: Member[]; sessionId?: string };
const TeamContext = createContext<TeamData | null>(null);
const useTeamData = () => useContext(TeamContext)!;

/** Shows a success toast when a team change went through. */
const done = (result: Promise<{ ok: boolean }>, message: string) =>
  result.then((r) => {
    if (r.ok) toast(message, { tone: "success" });
    return r.ok;
  });

export function TeamView() {
  return (
    <Gate permission="team.view">
      <TeamInner />
    </Gate>
  );
}

function TeamInner() {
  const data = useTeam();
  const { member } = useSession();
  const s: TeamData = { ...data, team: data.members, sessionId: member?.id };
  const [tab, setTab] = useQueryState<"members" | "roles">("tab", "members");
  const canManage = useCan("team.manage");
  const [inviting, setInviting] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | "new" | null>(null);

  return (
    <TeamContext value={s}>
      {data.error && (
        <p role="alert" className="mb-4 text-sm text-warning">
          {data.error}{" "}
          <button type="button" onClick={data.refresh} className="underline">
            Retry
          </button>
        </p>
      )}
      <PageHeader title="Team & roles" description="Who can use the portal and exactly what each role is allowed to do.">
        {canManage &&
          (tab === "members" ? (
            <button type="button" onClick={() => setInviting(true)} className={buttonClass("dark", "sm")}>
              <UserPlus className="size-4" aria-hidden />
              Invite admin
            </button>
          ) : (
            <button type="button" onClick={() => setEditingRole("new")} className={buttonClass("dark", "sm")}>
              <Plus className="size-4" aria-hidden />
              New role
            </button>
          ))}
      </PageHeader>
      <Segmented
        label="Team sections"
        value={tab}
        onChange={setTab}
        className="mb-4 w-fit"
        options={[
          { id: "members", label: "Members", count: s.team.length },
          { id: "roles", label: "Roles & permissions", count: s.roles.length },
        ]}
      />
      {tab === "members" ? <Members /> : <Roles onEdit={setEditingRole} />}
      <InviteSheet open={inviting} onClose={() => setInviting(false)} />
      <RoleSheet role={editingRole} onClose={() => setEditingRole(null)} />
    </TeamContext>
  );
}

function Members() {
  const s = useTeamData();
  const canManage = useCan("team.manage");
  const [removing, setRemoving] = useState<Member | null>(null);
  const roleName = (id: string) => s.roles.find((r) => r.id === id)?.name ?? "No role";

  return (
    <Card>
      <ul className="divide-y divide-line">
        {s.team.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap sm:px-5">
            <Avatar name={m.name} size={38} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[13.5px] font-medium text-ink-950">
                <span className="truncate">{m.name}</span>
                {m.id === s.sessionId && <Badge>You</Badge>}
                {m.status === "invited" && (
                  <Badge tone="warning">
                    <Mail className="size-3" aria-hidden />
                    Invited
                  </Badge>
                )}
              </p>
              <p className="truncate text-xs text-ink-500">
                {m.email}
                {m.lastActiveAt && (
                  <>
                    {" · active "}
                    <RelativeTime at={m.lastActiveAt} />
                  </>
                )}
              </p>
            </div>
            <div className="flex w-full items-center gap-2 pl-[50px] sm:w-auto sm:pl-0">
              {canManage ? (
                <Select
                  aria-label={`Role for ${m.name}`}
                  value={m.roleId}
                  onChange={(e) => done(s.changeRole(m, e.target.value), `${m.name} is now ${roleName(e.target.value)}`)}
                  className="h-9 w-full sm:w-44"
                >
                  {s.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Badge tone={m.roleId === OWNER_ROLE ? "maroon" : "neutral"}>{roleName(m.roleId)}</Badge>
              )}
              <RowMenu
                label={m.name}
                actions={[
                  {
                    label: "Remove from team",
                    icon: UserMinus,
                    danger: true,
                    hidden: !canManage || m.id === s.sessionId,
                    onClick: () => setRemoving(m),
                  },
                ]}
              />
            </div>
          </li>
        ))}
      </ul>
      <Confirm
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={`Remove ${removing?.name}?`}
        body="They lose access to the portal immediately. Their past actions stay in the audit log."
        confirmLabel="Remove"
        onConfirm={() => removing && done(s.remove(removing), `${removing.name} removed`)}
      />
    </Card>
  );
}

function Roles({ onEdit }: { onEdit: (r: Role) => void }) {
  const s = useTeamData();
  const canManage = useCan("team.manage");
  const members = (id: string) => s.team.filter((m) => m.roleId === id).length;

  const toggle = (role: Role, p: Permission) => s.togglePermission(role, p);

  return (
    <Card>
      <CardHeader
        title="Permission matrix"
        description={
          canManage
            ? "Tick a box to grant a permission. Changes apply instantly to everyone with that role."
            : "Ask an owner to change permissions."
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-elevated px-5 py-3 text-left text-[11.5px] font-medium tracking-wide text-ink-500 uppercase"
              >
                Permission
              </th>
              {s.roles.map((r) => (
                <th key={r.id} scope="col" className="min-w-[112px] px-2 py-3 text-center align-bottom">
                  <button
                    type="button"
                    onClick={() => canManage && onEdit(r)}
                    disabled={!canManage}
                    className="group inline-flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 hover:bg-surface disabled:hover:bg-transparent"
                  >
                    <span className="flex items-center gap-1 font-semibold text-ink-950">
                      {r.name}
                      {canManage && <Pencil className="size-3 text-ink-300 group-hover:text-ink-700" aria-hidden />}
                    </span>
                    <span className="text-[11px] font-normal text-ink-500">
                      {members(r.id)} member{members(r.id) === 1 ? "" : "s"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          {(Object.entries(permissionGroups) as [string, Record<Permission, string>][]).map(([group, perms]) => (
            <tbody key={group}>
              <tr>
                <th
                  colSpan={s.roles.length + 1}
                  scope="colgroup"
                  className="sticky left-0 border-t border-line bg-surface/60 px-5 py-2 text-left text-[11.5px] font-semibold tracking-wider text-ink-500 uppercase"
                >
                  {group}
                </th>
              </tr>
              {(Object.entries(perms) as [Permission, string][]).map(([p, label]) => (
                <tr key={p} className="border-t border-line hover:bg-surface/40">
                  <th scope="row" className="sticky left-0 z-10 bg-elevated px-5 py-2.5 text-left font-normal">
                    <span className="block text-ink-900">{label}</span>
                    <code className="text-[11px] text-ink-400">{p}</code>
                  </th>
                  {s.roles.map((r) => {
                    const owner = r.id === OWNER_ROLE;
                    const on = owner || r.permissions.includes(p);
                    return (
                      <td key={r.id} className="px-2 py-2.5 text-center">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          aria-label={`${label} for ${r.name}`}
                          disabled={!canManage || owner}
                          onClick={() => toggle(r, p)}
                          title={owner ? "Owners always have every permission" : undefined}
                          className={cn(
                            "inline-grid size-6 place-items-center rounded-md border transition-colors",
                            on
                              ? "border-ink-950 bg-ink-950 text-canvas"
                              : "border-line-strong bg-elevated text-transparent hover:border-ink-700",
                            owner && "opacity-60",
                          )}
                        >
                          {owner ? <Lock className="size-3" aria-hidden /> : <Check className="size-3.5" strokeWidth={3} aria-hidden />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </Card>
  );
}

function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useTeamData();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("viewer");
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function submit() {
    if (await done(s.invite({ name, email, roleId }), `${name.trim()} can now sign in with ${email.trim()}`)) {
      setName("");
      setEmail("");
      onClose();
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite an admin"
      footer={
        <button type="button" onClick={submit} disabled={!name.trim() || !validEmail} className={buttonClass("dark", "md", "w-full")}>
          Send invite
        </button>
      }
    >
      <div className="space-y-4">
        <Field label="Full name">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}</Field>
        <Field label="Email" hint="They sign in with this address.">
          {(id) => (
            <TextInput id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@ashesi.edu.gh" />
          )}
        </Field>
        <Field label="Role" hint={s.roles.find((r) => r.id === roleId)?.description}>
          {(id) => (
            <Select id={id} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {s.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Sheet>
  );
}

function RoleSheet({ role, onClose }: { role: Role | "new" | null; onClose: () => void }) {
  return (
    <Sheet open={!!role} onClose={onClose} title={role === "new" ? "New role" : `Edit ${role?.name ?? "role"}`}>
      {role && <RoleForm key={role === "new" ? "new" : role.id} role={role} onClose={onClose} />}
    </Sheet>
  );
}

function RoleForm({ role, onClose }: { role: Role | "new"; onClose: () => void }) {
  const s = useTeamData();
  const isNew = role === "new";
  const [name, setName] = useState(isNew ? "" : role.name);
  const [description, setDescription] = useState(isNew ? "" : role.description);
  const [copyFrom, setCopyFrom] = useState("viewer");
  const [fallback, setFallback] = useState("viewer");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const members = isNew ? 0 : s.team.filter((m) => m.roleId === role.id).length;

  async function save() {
    const base = isNew
      ? {
          id: newRoleId(name, s.roles),
          name: name.trim(),
          description: description.trim(),
          permissions: [...(s.roles.find((r) => r.id === copyFrom)?.permissions ?? [])],
        }
      : { ...role, name: name.trim(), description: description.trim() };
    if (await done(s.saveRole(base, isNew), isNew ? `${base.name} role created` : "Role updated")) onClose();
  }

  return (
    <div className="space-y-4">
      <Field label="Name">
        {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoFocus />}
      </Field>
      <Field label="Description">
        {(id) => <TextInput id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={90} />}
      </Field>
      {isNew && (
        <Field label="Start with the permissions of" hint="You can fine-tune them in the matrix afterwards.">
          {(id) => (
            <Select id={id} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              {s.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.id === OWNER_ROLE ? "all" : r.permissions.length} permissions)
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <button type="button" onClick={save} disabled={!name.trim()} className={buttonClass("dark", "md", "w-full")}>
        {isNew ? "Create role" : "Save"}
      </button>
      {!isNew && !role.system && (
        <div className="border-t border-line pt-4">
          {confirmDelete ? (
            <div className="space-y-3 rounded-xl bg-maroon-50 p-3">
              <p className="text-[13px] text-ink-900">
                {members ? `Move its ${members} member${members > 1 ? "s" : ""} to:` : "Delete this role?"}
              </p>
              {members > 0 && (
                <Select aria-label="New role for members" value={fallback} onChange={(e) => setFallback(e.target.value)}>
                  {s.roles
                    .filter((r) => r.id !== role.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </Select>
              )}
              <button
                type="button"
                onClick={async () => (await done(s.deleteRole(role, fallback), `${role.name} deleted`)) && onClose()}
                className={buttonClass("primary", "sm", "w-full")}
              >
                Delete role
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className={buttonClass("ghost", "sm", "w-full text-maroon-700")}>
              <Trash2 className="size-4" aria-hidden />
              Delete role
            </button>
          )}
        </div>
      )}
      {!isNew && role.system && <p className="text-center text-xs text-ink-500">Built-in roles can be renamed but not deleted.</p>}
    </div>
  );
}
