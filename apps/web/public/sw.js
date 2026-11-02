/*
 * Hilltop service worker.
 * - Pages: network first, falling back to the cached copy, then to /offline.
 * - Static assets and optimised images: stale-while-revalidate.
 * - Push: shows server-sent notifications (once a backend sends them).
 * - Notification clicks open the relevant page.
 */

const VERSION = "hilltop-v2";
const PUBLIC_PAGES = new Set(["/", "/browse", "/help", "/privacy", "/offline"]);
const PAGE_TTL = 15 * 60 * 1000;
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && PUBLIC_PAGES.has(url.pathname)) event.waitUntil(save(PAGES, request, response.clone(), 30));
      return response;
    }).catch(async () => {
      const cached = PUBLIC_PAGES.has(url.pathname) ? await caches.match(request) : undefined;
      if (cached && Date.now() - Number(cached.headers.get("x-hilltop-cached-at")) < PAGE_TTL) return cached;
      return (await caches.match(OFFLINE_URL)) || new Response("You are offline. Reconnect and try again.", { status: 503 });
    }));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) event.waitUntil(save(ASSETS, request, response.clone(), 100));
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { return; }
  if (!data || typeof data.title !== "string") return;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      // Same tag as a notification the open app may show, so it never appears twice.
      tag: data.tag,
      data: { href: data.href || "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.href) || "/notifications", self.location.origin);
  const href = target.origin === self.location.origin ? target.href : `${self.location.origin}/notifications`;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        existing.navigate(href);
        return existing.focus();
      }
      return self.clients.openWindow(href);
    }),
  );
});

async function save(name, request, response, maxEntries) {
  const cache = await caches.open(name);
  const headers = new Headers(response.headers);
  headers.set("x-hilltop-cached-at", String(Date.now()));
  await cache.put(request, new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)));
}
