"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellRing, MessageCircle, Package, Search, ShieldAlert, Star, Tag, Wallet, type LucideIcon } from "lucide-react";
import { useDismiss, useOnNavigate } from "@/lib/hooks";
import { unreadCount } from "@/lib/model";
import { enableNotifications, notificationPermission } from "@/lib/push";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { AppNotification, NotificationKind } from "@/lib/types";
import { RelativeTime } from "./controls";
import { buttonClass, cn } from "./ui";

const icons: Record<NotificationKind, LucideIcon> = {
  offer: Tag,
  order: Package,
  message: MessageCircle,
  payout: Wallet,
  alert: Search,
  review: Star,
  dispute: ShieldAlert,
};

/** Bell with an unread badge: a popover on desktop, the notifications page on phones. */
export function NotificationBell() {
  const { notifications } = useStore();
  const unread = unreadCount({ notifications });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  useOnNavigate(() => setOpen(false));

  const badge = (
    <AnimatePresence>
      {unread > 0 && (
        <motion.span
          key={unread}
          initial={{ scale: 0.4 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          transition={{ type: "spring", stiffness: 600, damping: 15 }}
          className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-maroon-700 px-1 text-[10px] leading-4 font-semibold text-white"
        >
          {unread}
        </motion.span>
      )}
    </AnimatePresence>
  );
  const label = `Notifications (${unread} unread)`;
  const iconClass =
    "relative grid size-10 place-items-center rounded-xl text-ink-700 transition-colors hover:bg-surface hover:text-ink-950";

  return (
    <div ref={ref} className="relative">
      <Link href="/notifications" className={cn(iconClass, "md:hidden")} aria-label={label}>
        <Bell className="size-5" aria-hidden />
        {badge}
      </Link>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={label}
        className={cn(iconClass, "max-md:hidden")}
      >
        <motion.span animate={unread ? { rotate: [0, -12, 10, -6, 0] } : {}} transition={{ duration: 0.6 }} key={unread}>
          <Bell className="size-5" aria-hidden />
        </motion.span>
        {badge}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 z-50 mt-2 w-[380px] origin-top-right overflow-hidden rounded-2xl border border-line bg-elevated shadow-pop"
          >
            <NotificationList limit={6} compact />
            <Link
              href="/notifications"
              className="block border-t border-line py-3 text-center text-sm font-medium text-ink-950 hover:bg-surface"
            >
              See all notifications
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const noop = () => () => {};

/** Prompt to turn on system notifications, hidden once decided. */
export function PushPrompt() {
  const permission = useSyncExternalStore(noop, notificationPermission, () => "unsupported" as const);
  // The answer from this session wins; until then follow the browser's current permission.
  const [decided, setState] = useState<string | null>(null);
  if ((decided ?? permission) !== "default") return null;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface p-3.5">
      <BellRing className="size-5 shrink-0 text-ink-950" aria-hidden />
      <p className="flex-1 text-[13px] text-ink-700">
        Get a heads-up when sellers reply or your payment is released, even when Hilltop is closed.
      </p>
      <button
        type="button"
        onClick={async () => {
          const result = await enableNotifications();
          setState(result);
          if (result === "granted") toast("Notifications on", { tone: "success" });
        }}
        className={buttonClass("dark", "sm")}
      >
        Turn on
      </button>
    </div>
  );
}

export function NotificationList({
  limit,
  compact = false,
  unreadOnly = false,
}: {
  limit?: number;
  compact?: boolean;
  unreadOnly?: boolean;
}) {
  const { notifications, markRead, markAllRead } = useStore();
  const router = useRouter();
  const items = (unreadOnly ? notifications.filter((n) => !n.read) : notifications).slice(0, limit);
  const unread = unreadCount({ notifications });

  function open(n: AppNotification) {
    markRead(n.id);
    router.push(n.href);
  }

  return (
    <div>
      <div className={cn("flex items-center justify-between", compact ? "px-4 pt-3.5 pb-2" : "pb-3")}>
        {compact && <p className="text-sm font-semibold text-ink-950">Notifications</p>}
        {unread > 0 && (
          <button type="button" onClick={markAllRead} className="ml-auto text-xs font-medium text-ink-500 hover:text-ink-950">
            Mark all as read
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className={cn("text-center text-sm text-ink-500", compact ? "px-4 py-10" : "py-16")}>
          {unreadOnly ? "You're all caught up." : "Nothing yet. Activity on your orders, offers and chats shows up here."}
        </p>
      ) : (
        <ul className={compact ? "max-h-[60vh] overflow-y-auto px-2 pb-2" : "space-y-1"}>
          <AnimatePresence initial={false}>
            {items.map((n) => {
              const Icon = icons[n.kind];
              return (
                <motion.li key={n.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <button
                    type="button"
                    onClick={() => open(n)}
                    className="flex w-full gap-3 rounded-xl p-3 text-left transition-colors hover:bg-surface"
                  >
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-full",
                        n.read ? "bg-surface text-ink-500" : "bg-ink-950 text-canvas",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={cn("text-sm", n.read ? "text-ink-700" : "font-semibold text-ink-950")}>{n.title}</span>
                        <RelativeTime at={n.at} className="shrink-0 text-[11px] text-ink-500" />
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[13px] leading-5 text-ink-500">{n.body}</span>
                    </span>
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-maroon-700" aria-label="Unread" />}
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
