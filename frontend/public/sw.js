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

/*
 * Push notifications — shipment updates for customers, new pickups for partners. The payload is
 * JSON from the backend's PushService: { title, body, url, tag }.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "NationWide Logistics", {
      body: data.body || "",
      icon: "/assets/icons/icon-192.png",
      badge: "/assets/icons/icon-192.png",
      // Same tag replaces the earlier notification for the same thing, instead of stacking five
      // "in transit" updates for one parcel.
      tag: data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Reuse an open app window rather than opening a second copy of the app.
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        return open
          .focus()
          .then(() => open.navigate(target))
          .catch(() => self.clients.openWindow(target));
      }
      return self.clients.openWindow(target);
    }),
  );
});
