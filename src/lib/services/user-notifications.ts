import { adminDb } from "@/lib/firebase/admin";
import type { UserNotificationType } from "@/lib/types";

interface CreateNotificationParams {
  user_id: string;
  church_id: string;
  type: UserNotificationType;
  title: string;
  body: string;
  metadata?: Record<string, string | null>;
}

/**
 * Resolve a volunteer_id to its linked user_id via the memberships collection.
 * Returns null if no linked user is found (e.g., unlinked CSV-imported volunteer).
 */
export async function resolveUserId(
  churchId: string,
  volunteerId: string,
): Promise<string | null> {
  const snap = await adminDb
    .collection("memberships")
    .where("church_id", "==", churchId)
    .where("volunteer_id", "==", volunteerId)
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data().user_id ?? null;
}

/**
 * Create a single user notification in Firestore.
 * Returns the created document ID.
 */
export async function createUserNotification(
  params: CreateNotificationParams,
): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 90);

  const ref = adminDb.collection("user_notifications").doc();
  await ref.set({
    user_id: params.user_id,
    church_id: params.church_id,
    type: params.type,
    title: params.title,
    body: params.body,
    metadata: params.metadata ?? {},
    read: false,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  return ref.id;
}

/**
 * Create multiple user notifications in a single batch write.
 * Firestore batches support up to 500 operations.
 */
export async function createUserNotificationBatch(
  notifications: CreateNotificationParams[],
): Promise<void> {
  if (notifications.length === 0) return;

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 90);
  const createdAt = now.toISOString();
  const expiresAtStr = expiresAt.toISOString();

  // Split into chunks of 500 (Firestore batch limit)
  for (let i = 0; i < notifications.length; i += 500) {
    const chunk = notifications.slice(i, i + 500);
    const batch = adminDb.batch();

    for (const n of chunk) {
      const ref = adminDb.collection("user_notifications").doc();
      batch.set(ref, {
        user_id: n.user_id,
        church_id: n.church_id,
        type: n.type,
        title: n.title,
        body: n.body,
        metadata: n.metadata ?? {},
        read: false,
        created_at: createdAt,
        expires_at: expiresAtStr,
      });
    }

    await batch.commit();
  }
}
