"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, LogOut, Moon, Search } from "lucide-react";
import { can } from "@hilltop/shared/permissions";
import { useBodyScrollLock, useFocusTrap } from "@hilltop/ui/hooks";
import { setTheme, useTheme } from "@hilltop/ui/theme";
import { cn } from "@hilltop/ui/ui";
import { useAdmin, useSession } from "@/lib/store";
import { useAdminSession } from "@/lib/session";
import { navItems } from "./nav";

type Command = { id: string; label: string; group: string; icon: React.ElementType; hint?: string; run: () => void };

/** Ctrl/Cmd+K: jump to any page, user, listing or order the admin can see. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <AnimatePresence>{open && <Palette onClose={onClose} />}</AnimatePresence>;
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { role } = useSession();
  const { signOut } = useAdminSession();
  const s = useAdmin();
  const { isDark } = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useBodyScrollLock(true);
  useFocusTrap(panel, true);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      router.push(href);
      onClose();
    };
    const pages = navItems
      .filter((i) => can(role, i.permission))
      .map((i) => ({ id: i.href, label: i.label, group: "Pages", icon: i.icon, hint: i.keywords, run: go(i.href) }));
    const q = query.trim().toLowerCase();
    // Records only appear once the admin starts typing, to keep the list short.
    const records: Command[] =
      q.length < 2
        ? []
        : [
            ...(can(role, "users.view")
              ? s.users.map((u) => ({
                  id: `u-${u.id}`,
                  label: u.name,
                  group: "Users",
                  icon: navItems[1].icon,
                  hint: u.email,
                  run: go(`/users?q=${encodeURIComponent(u.name)}`),
                }))
              : []),
            ...(can(role, "listings.view")
              ? s.listings.map((l) => ({
                  id: `l-${l.id}`,
                  label: l.title,
                  group: "Listings",
                  icon: navItems[2].icon,
                  hint: l.sellerName,
                  run: go(`/listings?q=${encodeURIComponent(l.title)}`),
                }))
              : []),
            ...(can(role, "orders.view")
              ? s.orders.map((o) => ({
                  id: `o-${o.id}`,
                  label: o.id,
                  group: "Orders",
                  icon: navItems[3].icon,
                  hint: `${o.title} ${o.buyer}`,
                  run: go(`/orders?q=${o.id}`),
                }))
              : []),
          ];
    const actions: Command[] = [
      {
        id: "theme",
        label: isDark ? "Switch to light mode" : "Switch to dark mode",
        group: "Actions",
        icon: Moon,
        run: () => setTheme(isDark ? "light" : "dark"),
      },
      { id: "signout", label: "Sign out", group: "Actions", icon: LogOut, run: () => void signOut() },
    ];
    const all = [...pages, ...actions, ...records];
    if (!q) return all;
    return all.filter((c) => `${c.label} ${c.hint ?? ""} ${c.group}`.toLowerCase().includes(q)).slice(0, 40);
  }, [query, role, s.users, s.listings, s.orders, isDark, router, onClose, signOut]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(commands.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commands[active]?.run();
    } else if (e.key === "Escape") onClose();
  }

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-3 pt-[10vh] sm:p-6 sm:pt-[14vh]">
      <motion.div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -8 }}
        transition={{ duration: 0.16 }}
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-elevated shadow-pop"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-[18px] text-ink-400" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search pages, users, listings, orders"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={commands[active] ? `cmd-${commands[active].id}` : undefined}
            className="h-14 flex-1 bg-transparent text-[15px] text-ink-950 placeholder:text-ink-400 focus:outline-none"
          />
          <kbd className="rounded-md border border-line-strong px-1.5 py-0.5 text-[11px] text-ink-500">Esc</kbd>
        </div>
        <ul ref={list} id="palette-list" role="listbox" className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {commands.length === 0 && <li className="px-3 py-10 text-center text-sm text-ink-500">No matches for “{query}”</li>}
          {commands.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <li key={c.id} role="presentation">
                {header && (
                  <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-ink-400 uppercase first:pt-1">{header}</p>
                )}
                <div
                  id={`cmd-${c.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={c.run}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px]",
                    i === active ? "bg-surface text-ink-950" : "text-ink-700",
                  )}
                >
                  <c.icon className="size-4 shrink-0 text-ink-500" aria-hidden />
                  <span className="truncate font-medium">{c.label}</span>
                  {c.group !== "Pages" && c.hint && <span className="truncate text-xs text-ink-400">{c.hint}</span>}
                  {i === active && <CornerDownLeft className="ml-auto size-3.5 shrink-0 text-ink-400" aria-hidden />}
                </div>
              </li>
            );
          })}
        </ul>
      </motion.div>
    </div>
  );
}
