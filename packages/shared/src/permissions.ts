/*
 * Admin permissions. The list of capabilities is defined in code (each one guards
 * a real action), but which role gets which permission, and who has which role,
 * is configured in the admin portal.
 */

export const permissionGroups = {
  Dashboard: { "dashboard.view": "View the overview and analytics" },
  Users: {
    "users.view": "View users",
    "users.verify": "Verify or unverify students",
    "users.suspend": "Suspend and reinstate users",
    "users.delete": "Delete users",
  },
  Listings: {
    "listings.view": "View listings",
    "listings.moderate": "Approve, hide or remove listings",
    "listings.feature": "Feature and promote listings",
  },
  Orders: {
    "orders.view": "View orders",
    "orders.refund": "Refund or release payments",
  },
  Disputes: {
    "disputes.view": "View disputes",
    "disputes.resolve": "Resolve disputes",
  },
  Catalog: {
    "catalog.view": "View categories",
    "catalog.edit": "Create and edit categories and their fields",
  },
  Settings: {
    "settings.view": "View platform settings",
    "settings.edit": "Change fees, payments, features and content",
    "settings.publish": "Publish changes to the live marketplace",
  },
  Team: {
    "team.view": "View admins and roles",
    "team.manage": "Invite admins and edit roles and permissions",
  },
  Audit: { "audit.view": "View the audit log" },
} as const;

type Groups = typeof permissionGroups;
export type Permission = { [G in keyof Groups]: keyof Groups[G] }[keyof Groups];

export const allPermissions = Object.values(permissionGroups).flatMap((g) => Object.keys(g)) as Permission[];

export type Role = {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  /** System roles can be edited but not deleted, and the owner role always keeps every permission. */
  system?: boolean;
};

export const OWNER_ROLE = "owner";

export const defaultRoles: Role[] = [
  {
    id: OWNER_ROLE,
    name: "Owner",
    description: "Full control, including team and publishing.",
    permissions: [...allPermissions],
    system: true,
  },
  {
    id: "operations",
    name: "Operations",
    description: "Runs day-to-day: orders, disputes, users and listings.",
    permissions: [
      "dashboard.view",
      "users.view",
      "users.verify",
      "users.suspend",
      "listings.view",
      "listings.moderate",
      "listings.feature",
      "orders.view",
      "orders.refund",
      "disputes.view",
      "disputes.resolve",
      "catalog.view",
      "settings.view",
      "audit.view",
    ],
  },
  {
    id: "moderator",
    name: "Moderator",
    description: "Keeps listings and users safe.",
    permissions: ["dashboard.view", "users.view", "users.verify", "listings.view", "listings.moderate", "disputes.view", "catalog.view"],
  },
  {
    id: "support",
    name: "Support",
    description: "Helps students with orders and disputes.",
    permissions: ["dashboard.view", "users.view", "orders.view", "disputes.view", "disputes.resolve"],
  },
  { id: "viewer", name: "Viewer", description: "Read-only access to analytics.", permissions: ["dashboard.view"] },
];

export function can(role: Role | undefined, permission: Permission) {
  if (!role) return false;
  return role.id === OWNER_ROLE || role.permissions.includes(permission);
}

/** Toggles one permission on a role. The owner role can't lose permissions. */
export function togglePermission(role: Role, permission: Permission): Role {
  if (role.id === OWNER_ROLE) return role;
  const has = role.permissions.includes(permission);
  return { ...role, permissions: has ? role.permissions.filter((p) => p !== permission) : [...role.permissions, permission] };
}
