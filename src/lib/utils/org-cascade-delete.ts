/**
 * Shared utility for cascading deletion of an organization and all its data.
 * Used by both DELETE /api/organization and DELETE /api/account/delete.
 */

import type { Firestore } from "firebase-admin/firestore";

const SUBCOLLECTIONS = [
  "people",
  "ministries",
  "services",
  "events",
  "schedules",
  "assignments",
  "notifications",
  "integrations",
  "invite_queue",
  "import_logs",
  "households",
  "songs",
  "calendar_feeds",
  "rooms",
  "room_reservations",
  "swap_requests",
  "short_links",
  "check_in_codes",
  "training_sessions",
];

export interface CascadeDeleteResult {
  /** User IDs of all members whose memberships were deleted. */
  affectedUserIds: Set<string>;
}

/**
 * Delete an organization and all associated data:
 *   - All subcollections under churches/{churchId}
 *   - All memberships, event_signups, short_links, pending_invites for the church
 *   - The church document itself
 *   - Clears church_id / default_church_id from affected user profiles
 *
 * Does NOT handle: Stripe cancellation, email notifications, or auth checks.
 * Those are the caller's responsibility.
 */
export async function cascadeDeleteOrg(
  db: Firestore,
  churchId: string,
): Promise<CascadeDeleteResult> {
  let batch = db.batch();
  let deleteCount = 0;

  async function addDelete(ref: ReturnType<typeof db.doc>) {
    batch.delete(ref);
    deleteCount++;
    if (deleteCount >= 490) {
      await batch.commit();
      batch = db.batch();
      deleteCount = 0;
    }
  }

  // Delete all subcollections under the church document
  for (const collection of SUBCOLLECTIONS) {
    const snap = await db.collection(`churches/${churchId}/${collection}`).get();
    for (const d of snap.docs) {
      await addDelete(d.ref);
    }
  }

  // Delete all memberships for this church
  const membershipsSnap = await db
    .collection("memberships")
    .where("church_id", "==", churchId)
    .get();
  for (const d of membershipsSnap.docs) {
    await addDelete(d.ref);
  }

  // Delete all event_signups for this church
  const signupsSnap = await db
    .collection("event_signups")
    .where("church_id", "==", churchId)
    .get();
  for (const d of signupsSnap.docs) {
    await addDelete(d.ref);
  }

  // Delete all short_links for this church
  const shortLinksSnap = await db
    .collection("short_links")
    .where("church_id", "==", churchId)
    .get();
  for (const d of shortLinksSnap.docs) {
    await addDelete(d.ref);
  }

  // Delete pending_invites for this church
  const pendingSnap = await db
    .collection("pending_invites")
    .where("church_id", "==", churchId)
    .get();
  for (const d of pendingSnap.docs) {
    await addDelete(d.ref);
  }

  // Delete the church document itself
  await addDelete(db.doc(`churches/${churchId}`));

  // Commit remaining
  if (deleteCount > 0) {
    await batch.commit();
  }

  // Collect affected user IDs from memberships
  const affectedUserIds = new Set<string>();
  for (const d of membershipsSnap.docs) {
    const uid = d.data()?.user_id;
    if (uid) affectedUserIds.add(uid);
  }

  // Clear church_id / default_church_id from affected user profiles
  const profileBatch = db.batch();
  for (const uid of affectedUserIds) {
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) continue;
    const data = userSnap.data() || {};
    const updates: Record<string, unknown> = {};
    if (data.church_id === churchId) updates.church_id = null;
    if (data.default_church_id === churchId) updates.default_church_id = null;
    if (Object.keys(updates).length > 0) {
      profileBatch.update(userRef, updates);
    }
  }
  await profileBatch.commit();

  return { affectedUserIds };
}
