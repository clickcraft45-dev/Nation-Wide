/*
 * Service worker for the installed app.
 *
 * Scope is deliberately small. A service worker exists here for two reasons: a fetch handler is
 * what makes the app installable at all, and an installed app that shows the browser's dinosaur
 * when the train goes into a tunnel feels broken. It is NOT a caching layer.
 *
 * What is explicitly not cached, and why:
 *  - Next's hashed build assets. They are already immutable-cached over HTTP, and a stale
 *    service-worker copy of one chunk against a freshly deployed HTML shell is how a PWA ends up
 *    white-screening after every release.
 *  - Anything under /api. Those responses are per-user and carry authorisation; a shared cache
 *    entry is a cross-account data leak waiting to happen.
 *  - Any cross-origin request.
 */

const CACHE = "nw-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/assets/icons/icon-192.png"])),
  );
  // Take over as soon as it is installed rather than waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only page navigations are handled. Everything else — assets, API calls, third-party — falls
  // through to the network untouched, which is the browser's own behaviour.
  if (request.mode !== "navigate" || request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    // Network first: the content is live shipment data, so a cached page is worse than a wait.
    fetch(request).catch(() => caches.match(OFFLINE_URL)),
  );
});
