"use client";

import type { AppNotification } from "./types";

/*
 * Notifications outside the page. Locally we show them through the service worker
 * when the app is in the background. Real server push needs VAPID keys and a
 * backend endpoint: set NEXT_PUBLIC_VAPID_PUBLIC_KEY and implement savePushSubscription.
 */

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window;

export function notificationPermission(): NotificationPermission | "unsupported" {
  return pushSupported() ? Notification.permission : "unsupported";
}

export async function enableNotifications() {
  if (!pushSupported()) return "unsupported" as const;
  const result = await Notification.requestPermission();
  if (result === "granted") await subscribeToServerPush();
  return result;
}

/** Shows a system notification when the tab isn't visible, so it doesn't double up with in-app toasts. */
export async function showSystemNotification(n: AppNotification) {
  if (!pushSupported() || Notification.permission !== "granted" || document.visibilityState === "visible") return;
  const reg = await navigator.serviceWorker.getRegistration();
  reg?.showNotification(n.title, {
    body: n.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    tag: n.id,
    data: { href: n.href },
  });
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscribeToServerPush() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return null;
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  await savePushSubscription(sub.toJSON());
  return sub;
}

/** Placeholder for the backend call that stores the subscription. */
async function savePushSubscription(subscription: PushSubscriptionJSON) {
  void subscription;
}
