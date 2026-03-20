/**
 * VolunteerCal Service Worker
 *
 * Handles: offline caching, FCM background push notifications.
 */

/* eslint-disable no-restricted-globals */

const CACHE_NAME = "volunteercal-v1";
const STATIC_ASSETS = ["/", "/dashboard", "/offline"];

// Install — pre-cache static shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

// Activate — clean old caches
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

// Fetch — network-first with cache fallback for navigation
self.addEventListener("fetch", (event) => {
  // Only handle same-origin GET requests
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  // For navigation requests, try network first, then cache, then offline page
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful navigations
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match("/offline")),
        ),
    );
    return;
  }

  // For other assets, try cache first, then network
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
// Firebase Messaging uses this to show notifications when the app is in the background
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
        // If app is already open, focus it
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(url);
      }),
  );
});
