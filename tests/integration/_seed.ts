/**
 * Shared helpers for integration tests that exercise Next.js route handlers
 * against the Firestore emulator.
 *
 * The route handlers import `adminDb` + `adminAuth` from
 * `@/lib/firebase/admin`. Each integration test file mocks that module to
 * point `adminDb` at the emulator and stub `adminAuth.verifyIdToken` so
 * a Bearer token "u-admin" decodes to `{ uid: "u-admin" }`. See the
 * `vi.mock` block at the top of each *.test.ts file.
 */

import type { Firestore } from "firebase-admin/firestore";

/** Standard project ID used everywhere — must match firebase.json. */
export const TEST_PROJECT_ID = "demo-test";

/** Standard church + user IDs the seed helpers use. */
export const T = {
  churchId: "c1",
  ownerUid: "u-owner",
  adminUid: "u-admin",
  schedulerUid: "u-scheduler",
  volunteerUid: "u-volunteer",
};

/**
 * Clear every collection the integration tests touch. Cheaper + more
 * predictable than `firebase emulators:exec --import` between tests.
 */
export async function resetFirestore(db: Firestore): Promise<void> {
  const topLevel = [
    "churches",
    "memberships",
    "short_links",
    "audit_logs",
    "notification_outbox",
    "stripe_processed_events",
    "user_notifications",
  ];
  // Per-church subcollections the integration tests write to. Wipe these
  // separately because `churches/{id}` doc deletion does NOT cascade in
  // Firestore — orphan subcollection docs would otherwise stick around.
  const subcollections = [
    "assignments",
    "schedules",
    "people",
    "ministries",
    "services",
    "events",
    // Wave 9 P0-2 sub-PR B: pickup-management routes touch these.
    "households",
    "checkin_blocked_pickups",
    "checkinSettings",
  ];

  const churchSnap = await db.collection("churches").get();
  for (const churchDoc of churchSnap.docs) {
    for (const sub of subcollections) {
      const subSnap = await churchDoc.ref.collection(sub).get();
      if (subSnap.size === 0) continue;
      const batch = db.batch();
      for (const d of subSnap.docs) batch.delete(d.ref);
      await batch.commit();
    }
  }

  await Promise.all(
    topLevel.map(async (name) => {
      const snap = await db.collection(name).get();
      if (snap.size === 0) return;
      const batch = db.batch();
      for (const doc of snap.docs) batch.delete(doc.ref);
      await batch.commit();
    }),
  );
}

/**
 * Seed a single test church + owner/admin/volunteer memberships. Tier
 * defaults to `pro` so paywalled paths are exercised; pass a different
 * tier when testing a Free-tier guard.
 */
export async function seedChurchAndMemberships(
  db: Firestore,
  opts: { tier?: string } = {},
): Promise<void> {
  const tier = opts.tier ?? "pro";
  await db.collection("churches").doc(T.churchId).set({
    name: "Test Church",
    slug: "test",
    short_code: "TESTAB",
    org_type: "church",
    workflow_mode: "centralized",
    timezone: "America/Chicago",
    subscription_tier: tier,
    subscription_source: "manual",
    settings: {
      default_schedule_range_weeks: 4,
      default_reminder_channels: ["email"],
      require_confirmation: true,
    },
    created_at: new Date().toISOString(),
  });

  // Memberships keyed `${uid}_${churchId}` per the production convention.
  const mk = (uid: string, role: string) => ({
    user_id: uid,
    church_id: T.churchId,
    role,
    status: "active",
    ministry_scope: [],
    invited_by: null,
    volunteer_id: null,
    reminder_preferences: { channels: ["email"] },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  await db.collection("memberships").doc(`${T.ownerUid}_${T.churchId}`).set(mk(T.ownerUid, "owner"));
  await db.collection("memberships").doc(`${T.adminUid}_${T.churchId}`).set(mk(T.adminUid, "admin"));
  await db.collection("memberships").doc(`${T.schedulerUid}_${T.churchId}`).set(mk(T.schedulerUid, "scheduler"));
  await db.collection("memberships").doc(`${T.volunteerUid}_${T.churchId}`).set(mk(T.volunteerUid, "volunteer"));
}
