/* V.app service worker.
 * Security rule: NEVER cache ballots, verification, admin pages, API responses or results data.
 * Only static, public assets and an offline fallback page are cached. */
const VERSION = "vapp-v1";
const STATIC = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                       // ballots, logins, actions: always network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/(api|admin|platform|college|account|e|r|invite|dev|media)(\/|$)/.test(url.pathname)) {
    if (req.mode === "navigate") e.respondWith(fetch(req).catch(() => caches.match("/offline")));
    return;                                               // no caching of sensitive routes
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (req.mode === "navigate") e.respondWith(fetch(req).catch(() => caches.match("/offline")));
});
