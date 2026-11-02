"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellRing, MessageCircle, Package, Search, ShieldAlert, Star, Tag, Wallet, type LucideIcon } from "lucide-react";
import { useDismiss, useOnNavigate } from "@/lib/hooks";
import { unreadCount } from "@/lib/model";
import { enableNotifications, notificationPermission, PUSH_STATE_EVENT, pushRegisteredFor } from "@/lib/push";
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

const subscribePush = (listener: () => void) => {
  window.addEventListener(PUSH_STATE_EVENT, listener);
  window.addEventListener("focus", listener);
  return () => {
    window.removeEventListener(PUSH_STATE_EVENT, listener);
    window.removeEventListener("focus", listener);
  };
};

/** Prompt to turn on system notifications, hidden once decided. */
export function PushPrompt({ floating = false }: { floating?: boolean }) {
  const { user } = useStore();
  const state = useSyncExternalStore(
    subscribePush,
    () =>
      notificationPermission() === "granted" && user?.profileId && pushRegisteredFor(user.profileId)
        ? "registered"
        : notificationPermission(),
    () => "unsupported",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow] = useState(!floating);
  useEffect(() => {
    if (!floating || !user?.profileId) return;
    const timer = setTimeout(() => {
      try {
        if (Date.now() - Number(localStorage.getItem(`hilltop-push-dismissed:${user.profileId}`)) < 7 * 86400000) return;
      } catch {}
      setShow(true);
    }, 12000);
    return () => clearTimeout(timer);
  }, [floating, user?.profileId]);
  if (!user?.profileId || !show || dismissed || state === "registered" || state === "unsupported" || (floating && state === "denied"))
    return null;
  return (
    <div
      role="region"
      aria-label="Notification settings"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl bg-surface p-3.5",
        floating && "fixed right-3 bottom-24 left-3 z-50 border border-line bg-elevated shadow-pop sm:left-auto sm:w-96 md:bottom-5",
      )}
    >
      <BellRing className="size-5 shrink-0 text-ink-950" aria-hidden />
      <p className="flex-1 text-[13px] text-ink-700">
        {state === "denied"
          ? "Notifications are blocked. Allow them in your browser's site settings, then try again."
          : "Get alerts for messages, offers, orders and disputes, even when Hilltop is closed."}
      </p>
      {error && (
        <p role="alert" className="w-full text-sm text-warning">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          const result = await enableNotifications(user?.profileId);
          setBusy(false);
          if (result === "granted") toast("Notifications on", { tone: "success" });
          else if (result === "failed") setError("Couldn't turn on notifications. Check your connection, reload and try again.");
          else if (result === "denied") setError("Allow notifications in your browser's site settings to continue.");
          else if (result === "unsupported")
            setError("This browser doesn't support push. On iPhone, add Hilltop to your Home Screen and open it there.");
        }}
        className={buttonClass("dark", "sm")}
      >
        {busy ? "Turning on…" : state === "granted" ? "Retry setup" : "Turn on"}
      </button>
      {floating && (
        <button
          type="button"
          className={buttonClass("ghost", "sm")}
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(`hilltop-push-dismissed:${user.profileId}`, String(Date.now()));
            } catch {}
          }}
        >
          Not now
        </button>
      )}
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
  const { notifications, markRead, markAllRead, moreNotifications, loadMoreSocial } = useStore();
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
      {!compact && moreNotifications && (
        <button type="button" onClick={() => loadMoreSocial("notifications")} className={buttonClass("ghost", "sm", "mb-3")}>
          Load older notifications
        </button>
      )}
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
