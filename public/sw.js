/**
 * VolunteerCal Service Worker
 *
 * Handles: offline static-asset caching, FCM background push notifications.
 *
 * Auth-aware caching policy:
 *   - DO NOT pre-cache or cache navigation responses for authenticated routes
 *     (/dashboard, /account, /admin, etc.). Caching them causes stale shells
 *     after logout, org switch, or permission change — especially on shared
 *     devices like kiosks.
 *   - Static assets only (/_next/static/*, /icons/*, *.svg, *.png) are cached.
 *   - On logout, the app clears all caches via clearVolunteerCalCaches().
 */

/* eslint-disable no-restricted-globals */

// Bumped from v1 → v2 in track A.6 to invalidate old caches that contained
// /dashboard navigation responses on existing installs.
const CACHE_NAME = "volunteercal-v2";

// Only the truly public, low-sensitivity entry points are pre-cached.
// /dashboard intentionally excluded — see header comment.
const STATIC_ASSETS = ["/", "/offline"];

// Install — pre-cache static shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

// Activate — clean old caches (including any v1 caches with stale dashboard)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

/**
 * Routes that are private/authenticated. Navigation responses for these are
 * never cached. If the network fails, we serve the offline page instead of
 * a stale authenticated shell.
 */
const PRIVATE_PATH_PREFIXES = [
  "/dashboard",
  "/account",
  "/admin",
  "/checkin",
  "/api",
  "/join",
  "/confirm",
  "/calendar",
  "/s/", // short-link redirects must always hit the network
];

function isPrivatePath(pathname) {
  return PRIVATE_PATH_PREFIXES.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/"),
  );
}

// Fetch — strict policy:
//   - Authenticated/private navigation: network only, fall back to /offline
//   - Public navigation (/, marketing pages): network first, fall back to cached
//   - Static assets: cache first
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  const url = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    if (isPrivatePath(url.pathname)) {
      // Authenticated route — never cache, never serve cached.
      event.respondWith(
        fetch(event.request).catch(() => caches.match("/offline")),
      );
      return;
    }
    // Public route — network first, cache as fallback for the public shell.
    event.respondWith(
      fetch(event.request).catch(() =>
        caches
          .match(event.request)
          .then((cached) => cached || caches.match("/offline")),
      ),
    );
    return;
  }

  // Static assets — cache first
  if (
    event.request.url.includes("/_next/static/") ||
    event.request.url.includes("/icons/") ||
    event.request.url.endsWith(".svg") ||
    event.request.url.endsWith(".png")
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
          }),
      ),
    );
  }
});

// FCM Background Push Notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: "VolunteerCal", body: event.data.text() } };
  }

  const { title, body, icon, data } = payload.notification || {};

  event.waitUntil(
    self.registration.showNotification(title || "VolunteerCal", {
      body: body || "",
      icon: icon || "/icon-192.png",
      badge: "/icon-192.png",
      data: data || payload.data || {},
      vibrate: [200, 100, 200],
    }),
  );
});

// Notification click — open the app to the relevant page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});

// Allow the page to ask the SW to clear all caches (called on logout).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
  }
});
