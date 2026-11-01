"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, ChevronsUpDown, LogOut, Menu, RotateCcw, Search, X } from "lucide-react";
import { diffConfig } from "@hilltop/shared/config";
import { can } from "@hilltop/shared/permissions";
import { LogoMark } from "@hilltop/ui/logo";
import { ThemeSegmented, ThemeToggle } from "@hilltop/ui/theme-toggle";
import { Avatar, cn } from "@hilltop/ui/ui";
import { useBodyScrollLock, useDismiss, useFocusTrap } from "@hilltop/ui/hooks";
import { adoptDraft, adoptSession, resetDemo, useAdmin, useHydrated, usePublished, useSession } from "@/lib/store";
import { useAdminSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import type { PlatformConfig } from "@hilltop/shared/config";
import { CommandPalette } from "./command-palette";
import { isActive, navGroups } from "./nav";

export const MARKETPLACE_URL = process.env.NEXT_PUBLIC_MARKETPLACE_URL || "http://localhost:3000";

/** Live counts shown next to nav items, so queues are visible from anywhere. */
function useBadges() {
  const s = useAdmin();
  const { config } = usePublished();
  return useMemo(
    () =>
      ({
        "/disputes": s.disputes.filter((d) => d.state === "open").length,
        "/listings": s.listings.filter((l) => l.reports.length && l.state === "live").length,
        "/publish": s.draft ? diffConfig(config, s.draft).length : 0,
      }) as Record<string, number>,
    [s.disputes, s.listings, s.draft, config],
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useAdminSession();
  const mounted = useHydrated();
  const [palette, setPalette] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const ready = session.status === "ready";
  const member = ready ? session.member : undefined;
  const role = ready ? session.role : undefined;

  // Signed out, or signed in but not on the team: back to sign-in.
  useEffect(() => {
    if (session.status === "signed-out" || session.status === "not-admin") router.replace("/sign-in");
  }, [session.status, router]);

  // The local demo model checks actions against the admin's real role.
  useEffect(() => {
    if (member && role) adoptSession(member, role);
  }, [member, role]);

  // The shared config draft lives in the database.
  useEffect(() => {
    if (!ready) return;
    supabase()
      ?.from("config_draft")
      .select("config")
      .maybeSingle()
      .then(({ data }) => adoptDraft((data?.config as PlatformConfig | undefined) ?? null));
  }, [ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!mounted || !member) return <ShellSkeleton />;

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-canvas lg:flex">
        <SidebarContent onSearch={() => setPalette(true)} />
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-canvas/85 px-3 backdrop-blur-xl sm:px-5 lg:h-16">
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label="Open menu"
          className="grid size-10 place-items-center rounded-xl text-ink-700 hover:bg-surface lg:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label="Overview">
          <LogoMark size={26} />
        </Link>
        <button
          type="button"
          onClick={() => setPalette(true)}
          className="ml-auto flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13px] text-ink-500 transition-colors hover:border-line-strong hover:text-ink-900 sm:w-72 lg:ml-0"
        >
          <Search className="size-4" aria-hidden />
          <span className="hidden sm:inline">Search pages and actions</span>
          <kbd className="ml-auto hidden rounded-md border border-line-strong bg-elevated px-1.5 py-0.5 text-[11px] font-medium text-ink-500 sm:inline">
            Ctrl K
          </kbd>
        </button>
        <div className="flex items-center gap-1 lg:ml-auto">
          <a
            href={MARKETPLACE_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-ink-700 hover:bg-surface hover:text-ink-950 sm:flex"
          >
            Marketplace
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
          <ThemeToggle />
        </div>
      </header>

      <AnimatePresence>{drawer && <Drawer onClose={() => setDrawer(false)} onSearch={() => setPalette(true)} />}</AnimatePresence>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />

      <main id="main" className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}

function SidebarContent({ onSearch, onNavigate }: { onSearch: () => void; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { role } = useSession();
  const badges = useBadges();
  const { releases } = usePublished();
  const live = releases[0];

  return (
    <>
      <div className="flex h-16 items-center gap-2.5 px-5">
        <LogoMark size={28} />
        <span className="text-[17px] font-semibold tracking-[-0.03em] text-ink-950">hilltop</span>
        <span className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Admin</span>
      </div>
      <nav aria-label="Admin" className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        {navGroups.map((group) => {
          const items = group.items.filter((i) => can(role, i.permission));
          if (!items.length) return null;
          return (
            <div key={group.label} className="mt-4 first:mt-1">
              <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">{group.label}</p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const badge = badges[item.href];
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors",
                          active ? "text-ink-950" : "text-ink-500 hover:bg-surface hover:text-ink-900",
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="nav-active"
                            className="absolute inset-0 rounded-xl bg-surface"
                            transition={{ type: "spring", stiffness: 500, damping: 40 }}
                          />
                        )}
                        <item.icon className={cn("relative size-[18px]", active && "text-maroon-700")} aria-hidden />
                        <span className="relative flex-1">{item.label}</span>
                        {badge > 0 && (
                          <span className="relative grid h-5 min-w-5 place-items-center rounded-full bg-maroon-700 px-1.5 text-[11px] font-semibold text-white tabular">
                            {badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-line p-3">
        <Link
          href="/publish"
          onClick={onNavigate}
          className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-ink-500 hover:bg-surface"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          {live ? `Live config v${live.version}` : "Running on defaults"}
          {badges["/publish"] > 0 && <span className="ml-auto font-medium text-warning">Unpublished</span>}
        </Link>
        <AccountMenu onSearch={onSearch} />
      </div>
    </>
  );
}

function AccountMenu({ onSearch }: { onSearch: () => void }) {
  const { member, role } = useSession();
  const { signOut } = useAdminSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  if (!member) return null;

  return (
    <div ref={ref} className="relative">
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.14 }}
            className="absolute inset-x-0 bottom-full mb-2 rounded-2xl border border-line bg-elevated p-2 shadow-pop"
          >
            <div className="px-2 pt-1 pb-2">
              <ThemeSegmented />
            </div>
            <MenuButton
              icon={Search}
              onClick={() => {
                setOpen(false);
                onSearch();
              }}
            >
              Search
            </MenuButton>
            <MenuButton
              icon={RotateCcw}
              onClick={() => {
                setOpen(false);
                resetDemo();
              }}
            >
              Reset demo data
            </MenuButton>
            <MenuButton icon={LogOut} onClick={() => signOut()}>
              Sign out
            </MenuButton>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-surface"
      >
        <Avatar name={member.name} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink-950">{member.name}</span>
          <span className="block truncate text-xs text-ink-500">{role?.name ?? "No role"}</span>
        </span>
        <ChevronsUpDown className="size-4 text-ink-400" aria-hidden />
      </button>
    </div>
  );
}

function MenuButton({ icon: Icon, onClick, children }: { icon: React.ElementType; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink-700 hover:bg-surface hover:text-ink-950"
    >
      <Icon className="size-4" aria-hidden />
      {children}
    </button>
  );
}

function Drawer({ onClose, onSearch }: { onClose: () => void; onSearch: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useBodyScrollLock(true);
  useFocusTrap(panel, true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <motion.div
        className="absolute inset-0 bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        exit={{ x: "-100%" }}
        transition={{ type: "spring", stiffness: 420, damping: 42 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.5, right: 0 }}
        onDragEnd={(_, info) => (info.offset.x < -80 || info.velocity.x < -500) && onClose()}
        className="absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col bg-canvas shadow-pop"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="absolute top-3 right-3 grid size-10 place-items-center rounded-xl text-ink-500 hover:bg-surface"
        >
          <X className="size-5" aria-hidden />
        </button>
        <SidebarContent
          onSearch={() => {
            onClose();
            onSearch();
          }}
          onNavigate={onClose}
        />
      </motion.div>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-dvh lg:pl-64" aria-busy="true" aria-label="Loading">
      <div className="fixed inset-y-0 left-0 hidden w-64 border-r border-line lg:block" />
      <div className="h-14 border-b border-line lg:h-16" />
      <div className="mx-auto max-w-[1240px] space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-surface" />
      </div>
    </div>
  );
}
