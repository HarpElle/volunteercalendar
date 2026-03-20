/**
 * Firebase Cloud Messaging — client-side push notification setup.
 *
 * Usage:
 *   const token = await requestPushPermission();
 *   if (token) await subscribePush(churchId, userId, token);
 */

import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";
import { app } from "./config";

let messagingInstance: Messaging | null = null;

function getMessagingInstance(): Messaging | null {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  if (!messagingInstance) {
    try {
      messagingInstance = getMessaging(app);
    } catch {
      // FCM not supported in this environment
      return null;
    }
  }
  return messagingInstance;
}

/**
 * Request notification permission and get the FCM token.
 * Returns the token string, or null if permission denied / unavailable.
 */
export async function requestPushPermission(): Promise<string | null> {
  const messaging = getMessagingInstance();
  if (!messaging) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    // Wait for service worker registration
    const registration = await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    return token || null;
  } catch (err) {
    console.error("FCM token error:", err);
    return null;
  }
}

/**
 * Listen for foreground messages and show a notification.
 * Call this once in the app layout.
 */
export function listenForForegroundMessages(
  callback?: (payload: { title: string; body: string; data?: Record<string, string> }) => void,
): (() => void) | null {
  const messaging = getMessagingInstance();
  if (!messaging) return null;

  const unsubscribe = onMessage(messaging, (payload) => {
    const title = payload.notification?.title || "VolunteerCal";
    const body = payload.notification?.body || "";

    // Show browser notification if the page is visible but not focused
    if (document.visibilityState === "visible" && Notification.permission === "granted") {
      new Notification(title, {
        body,
        icon: "/icon-192.png",
      });
    }

    callback?.({ title, body, data: payload.data });
  });

  return unsubscribe;
}

/**
 * Subscribe a user's FCM token to the server.
 */
export async function subscribePush(
  churchId: string,
  userId: string,
  fcmToken: string,
  authToken: string,
): Promise<boolean> {
  try {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        church_id: churchId,
        user_id: userId,
        fcm_token: fcmToken,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
