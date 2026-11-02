import {
  ClipboardList,
  FolderTree,
  Gavel,
  LayoutDashboard,
  type LucideIcon,
  MessageSquareWarning,
  Rocket,
  ScrollText,
  Settings2,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import type { Permission } from "@hilltop/shared/permissions";

export type NavItem = { href: string; label: string; icon: LucideIcon; permission: Permission; keywords?: string };

export const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Monitor",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, permission: "dashboard.view", keywords: "dashboard analytics gmv revenue" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/users", label: "Users", icon: Users, permission: "users.view", keywords: "students verify suspend" },
      { href: "/listings", label: "Listings", icon: Store, permission: "listings.view", keywords: "moderation reports feature" },
      { href: "/orders", label: "Orders", icon: ClipboardList, permission: "orders.view", keywords: "payments refund payout" },
      { href: "/disputes", label: "Disputes", icon: Gavel, permission: "disputes.view", keywords: "claims resolve" },
      {
        href: "/feedback",
        label: "Feedback",
        icon: MessageSquareWarning,
        permission: "feedback.view",
        keywords: "bugs ideas reports support",
      },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/catalog", label: "Catalog", icon: FolderTree, permission: "catalog.view", keywords: "categories fields attributes" },
      {
        href: "/settings",
        label: "Settings",
        icon: Settings2,
        permission: "settings.view",
        keywords: "fees payments features events announcement",
      },
      { href: "/publish", label: "Publish", icon: Rocket, permission: "settings.view", keywords: "release history rollback diff" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/team", label: "Team & roles", icon: ShieldCheck, permission: "team.view", keywords: "permissions invite members" },
      { href: "/audit", label: "Audit log", icon: ScrollText, permission: "audit.view", keywords: "history activity" },
    ],
  },
];

export const navItems = navGroups.flatMap((g) => g.items);

export const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
