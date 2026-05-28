"use client";

import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  limit,
  onSnapshot,
  type FirestoreError,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { log } from "@/lib/log";

/**
 * Lightweight real-time listener for unread notification presence.
 * Uses a limit(1) query so the snapshot is cheap — at most 1 document.
 */
export function useNotifications(
  userId: string | undefined,
  churchId: string | undefined,
): { hasUnread: boolean } {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (!userId || !churchId) {
      setHasUnread(false);
      return;
    }

    const q = query(
      collection(db, "user_notifications"),
      where("user_id", "==", userId),
      where("church_id", "==", churchId),
      where("read", "==", false),
      limit(1),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setHasUnread(!snapshot.empty);
      },
      (error: FirestoreError) => {
        setHasUnread(false);
        // permission-denied is transient during auth-state transitions (token refresh, sign-out, org switch); the listener recovers on its own.
        if (error.code === "permission-denied") {
          log.debug("useNotifications listener permission-denied (transient)", { error });
          return;
        }
        log.error("useNotifications listener error", { error, code: error.code });
      },
    );

    return unsubscribe;
  }, [userId, churchId]);

  return { hasUnread };
}
