"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on mount.
 * Call this once in the dashboard layout.
 */
export function useServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Check for updates periodically (every 60 minutes)
        setInterval(() => reg.update(), 60 * 60 * 1000);
      })
      .catch((err) => {
        console.warn("SW registration failed:", err);
      });
  }, []);
}
