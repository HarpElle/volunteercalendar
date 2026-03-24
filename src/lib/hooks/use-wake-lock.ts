"use client";

import { useEffect, useState } from "react";

/**
 * useWakeLock — keeps the screen awake using the Screen Wake Lock API.
 * Re-acquires the lock when the tab regains visibility (e.g. after switching tabs).
 * Returns whether the wake lock is currently active.
 */
export function useWakeLock(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
          setActive(true);
          wakeLock.addEventListener("release", () => setActive(false));
        }
      } catch {
        // Permission denied or not supported — silent fail
      }
    }

    requestWakeLock();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      wakeLock?.release();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return active;
}
