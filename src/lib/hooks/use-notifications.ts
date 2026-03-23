"use client";

import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";

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
      (error) => {
        console.error("useNotifications listener error:", error);
        setHasUnread(false);
      },
    );

    return unsubscribe;
  }, [userId, churchId]);

  return { hasUnread };
}
