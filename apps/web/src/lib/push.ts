"use client";

import { supabase } from "./supabase";
import type { AppNotification } from "./types";

/*
 * Notifications outside the page. With NEXT_PUBLIC_VAPID_PUBLIC_KEY set, each browser
 * a student allows is registered in push_subscriptions, and the database has the
 * marketplace deliver every new notification to it (see /api/push), even when Hilltop
 * is closed. An open tab in the background also shows them as they arrive.
 */

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window && "PushManager" in window;

export type PushResult = "granted" | "denied" | "default" | "unsupported" | "failed";
export const PUSH_STATE_EVENT = "hilltop-push-state";
let registeredFor: string | null = null;
export const pushRegisteredFor = (profileId: string) => registeredFor === profileId;

export function notificationPermission(): NotificationPermission | "unsupported" {
  return pushSupported() ? Notification.permission : "unsupported";
}

export async function enableNotifications(profileId?: string): Promise<PushResult> {
  if (!pushSupported()) return "unsupported" as const;
  if (!profileId) return "failed";
  try {
    const result = await Notification.requestPermission();
    if (result === "granted") await subscribeToServerPush(profileId);
    return result;
  } catch {
    return "failed";
  }
}

/** Registers this browser for the signed-in student, if they've allowed notifications. Safe to call on every visit. */
export async function syncPushSubscription(profileId: string) {
  if (!pushSupported() || Notification.permission !== "granted") return;
  await subscribeToServerPush(profileId).catch(() => {
    registeredFor = null;
    window.dispatchEvent(new Event(PUSH_STATE_EVENT));
  });
}

/** Stops this browser receiving the signed-in student's notifications (on sign-out). */
export async function forgetPushSubscription() {
  if (!pushSupported()) return;
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  registeredFor = null;
  if (!sub) return;
  // Local unsubscribe is independent of connectivity and runs even when the database is unavailable.
  const removed = await sub.unsubscribe();
  if (!removed) throw new Error("Couldn't turn off this browser's notifications.");
  const result = await supabase()?.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  if (result?.error) console.error("Push subscription cleanup failed", result.error.code);
  window.dispatchEvent(new Event(PUSH_STATE_EVENT));
}

/** Shows a system notification when the tab isn't visible, so it doesn't double up with in-app toasts. */
export async function showSystemNotification(n: AppNotification) {
  if (!pushSupported() || Notification.permission !== "granted" || document.visibilityState === "visible") return;
  const reg = await navigator.serviceWorker.getRegistration();
  await reg?.showNotification(n.title, {
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
  if (!key) throw new Error("Notifications aren't configured.");
  const response = await fetch("/api/push", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const capability: unknown = await response.json();
  if (!response.ok || !capability || typeof capability !== "object" || !("available" in capability) || capability.available !== true) {
    throw new Error("Push delivery isn't configured. Try again later.");
  }
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg?.active) throw new Error("Notifications aren't ready. Reload and try again.");
  let sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  try {
    await savePushSubscription(profileId, sub.toJSON());
  } catch (error) {
    // A shared browser may still have the former account's endpoint after an
    // offline sign-out. RLS correctly prevents stealing that row: rotate locally.
    if (!(error instanceof Error) || (error.cause !== "42501" && error.cause !== "23505")) throw error;
    if (!(await sub.unsubscribe())) throw error;
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    await savePushSubscription(profileId, sub.toJSON());
  }
  registeredFor = profileId;
  window.dispatchEvent(new Event(PUSH_STATE_EVENT));
  return sub;
}

async function savePushSubscription(profileId: string, subscription: PushSubscriptionJSON) {
  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error("Incomplete browser subscription.");
  const client = supabase();
  if (!client) throw new Error("Notifications aren't available.");
  // One browser belongs to whoever signed in on it last.
  const { error } = await client
    .from("push_subscriptions")
    .upsert({ endpoint, profile_id: profileId, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: "endpoint" });
  if (error) throw new Error("Couldn't register notifications. Try again.", { cause: error.code });
}
