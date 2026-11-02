"use client";

import { supabase } from "./supabase";
import type { AppNotification } from "./types";

/*
 * Notifications outside the page. With NEXT_PUBLIC_VAPID_PUBLIC_KEY set, each browser
 * a student allows is registered in push_subscriptions, and the database has the
 * marketplace deliver every new notification to it (see /api/push), even when Hilltop
 * is closed. An open tab in the background also shows them as they arrive.
 */

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window;

export function notificationPermission(): NotificationPermission | "unsupported" {
  return pushSupported() ? Notification.permission : "unsupported";
}

export async function enableNotifications(profileId?: string) {
  if (!pushSupported()) return "unsupported" as const;
  const result = await Notification.requestPermission();
  if (result === "granted" && profileId) await subscribeToServerPush(profileId).catch(() => null);
  return result;
}

/** Registers this browser for the signed-in student, if they've allowed notifications. Safe to call on every visit. */
export async function syncPushSubscription(profileId: string) {
  if (!pushSupported() || Notification.permission !== "granted") return;
  await subscribeToServerPush(profileId).catch(() => null);
}

/** Stops this browser receiving the signed-in student's notifications (on sign-out). */
export async function forgetPushSubscription() {
  if (!pushSupported()) return;
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (sub) await supabase()?.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
}

/** Shows a system notification when the tab isn't visible, so it doesn't double up with in-app toasts. */
export async function showSystemNotification(n: AppNotification) {
  if (!pushSupported() || Notification.permission !== "granted" || document.visibilityState === "visible") return;
  const reg = await navigator.serviceWorker.getRegistration();
  reg?.showNotification(n.title, {
    body: n.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    // The same tag as the server push, so the two never show twice.
    tag: n.id,
    data: { href: n.href },
  });
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscribeToServerPush(profileId: string) {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return null;
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  await savePushSubscription(profileId, sub.toJSON());
  return sub;
}

async function savePushSubscription(profileId: string, subscription: PushSubscriptionJSON) {
  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys.auth) return;
  // One browser belongs to whoever signed in on it last.
  await supabase()
    ?.from("push_subscriptions")
    .upsert({ endpoint, profile_id: profileId, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: "endpoint" });
}
