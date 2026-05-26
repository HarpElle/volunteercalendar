/**
 * Integration smoke for POST /api/roster/self-remove for event_signups
 * (Pass H Phase 6 full sweep Sev 2, 2026-05-25).
 *
 * Before this fix the self-remove handler read `data.person_id` for the
 * ownership check, but POST /api/signup writes `data.volunteer_id` (and,
 * for legacy logged-in signups, only `user_id`). A volunteer who created
 * their own signup got a 403 trying to cancel it.
 *
 * Coverage:
 *   - Happy path: new-shape signup (volunteer_id populated) is cancelled
 *     by its owner; status flips to "cancelled"
 *   - Legacy fallback: signup with empty volunteer_id but matching
 *     user_id is also cancellable by the same authenticated user
 *   - Ownership rejection: a different volunteer can't cancel someone
 *     else's signup
 *   - Cross-church rejection: a signup that belongs to a different
 *     church_id is rejected even if the user matches it
 */

import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("@/lib/firebase/admin", async () => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  const { initializeApp, getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = getApps()[0] ?? initializeApp({ projectId: "demo-test" });
  return {
    adminDb: getFirestore(app),
    adminAuth: {
      verifyIdToken: vi.fn(async (token: string) => ({ uid: token })),
    },
    adminStorage: {},
  };
});

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { POST } from "@/app/api/roster/self-remove/route";
import { resetFirestore, seedChurchAndMemberships, T } from "./_seed";

const PERSON_ID = "p-alex";
const EVENT_ID = "evt-1";
const ROLE_ID = "greeter";

function postRequest(body: object, token: string = T.volunteerUid): NextRequest {
  return new NextRequest("https://test/api/roster/self-remove", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function seedFixture(): Promise<void> {
  await resetFirestore(adminDb);
  // event_signups isn't in _seed.ts's topLevel wipe list (other tests
  // don't touch it). Clear it locally so test-to-test state doesn't
  // bleed through the cancelled-vs-confirmed assertions below.
  const stale = await adminDb.collection("event_signups").get();
  if (stale.size > 0) {
    const batch = adminDb.batch();
    for (const d of stale.docs) batch.delete(d.ref);
    await batch.commit();
  }
  await seedChurchAndMemberships(adminDb);
  const churchRef = adminDb.collection("churches").doc(T.churchId);

  // Person record linked to the volunteer membership user_id
  await churchRef.collection("people").doc(PERSON_ID).set({
    name: "Alex Kim",
    email: "alex@example.com",
    user_id: T.volunteerUid,
    is_volunteer: true,
    status: "active",
    ministry_ids: [],
    role_ids: [],
    campus_ids: [],
    household_ids: [],
    volunteer_journey: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

  // Set membership.volunteer_id so the route's userVolunteerId lookup
  // resolves to the Person. Without this, the new-shape match path
  // can't fire (membership.volunteer_id === null in the seed default).
  await adminDb
    .doc(`memberships/${T.volunteerUid}_${T.churchId}`)
    .update({ volunteer_id: PERSON_ID });

  // Event for the signup to reference (used downstream for name + date)
  await churchRef.collection("events").doc(EVENT_ID).set({
    church_id: T.churchId,
    name: "Outreach Saturday",
    date: "2026-09-12",
    start_time: "09:00",
    end_time: "12:00",
    all_day: false,
    ministry_ids: [],
    roles: [{ role_id: ROLE_ID, title: "Greeter", count: 5, allow_signup: true }],
    visibility: "public",
    signup_mode: "open",
  });
}

async function createSignup(opts: {
  id: string;
  volunteer_id: string;
  user_id: string | null;
}): Promise<void> {
  await adminDb.collection("event_signups").doc(opts.id).set({
    event_id: EVENT_ID,
    church_id: T.churchId,
    role_id: ROLE_ID,
    role_title: "Greeter",
    volunteer_id: opts.volunteer_id,
    user_id: opts.user_id,
    volunteer_name: "Alex Kim",
    volunteer_email: "alex@example.com",
    status: "confirmed",
    signed_up_at: new Date().toISOString(),
    approved_by: null,
  });
}

describe("POST /api/roster/self-remove — event_signup", () => {
  beforeEach(async () => {
    await seedFixture();
  });

  it("cancels a new-shape signup (volunteer_id populated) for its owner", async () => {
    const SIGNUP_ID = "sig-new-shape";
    await createSignup({
      id: SIGNUP_ID,
      volunteer_id: PERSON_ID,
      user_id: T.volunteerUid,
    });

    const res = await POST(
      postRequest({
        church_id: T.churchId,
        item_type: "event_signup",
        item_id: SIGNUP_ID,
      }),
    );
    expect(res.status).toBe(200);

    const snap = await adminDb.doc(`event_signups/${SIGNUP_ID}`).get();
    expect(snap.data()?.status).toBe("cancelled");
  });

  it("cancels a legacy signup (empty volunteer_id, matching user_id)", async () => {
    // Mirrors what pre-PR #78 production data looks like: the POST
    // handler wrote volunteer_id: "" when the signer was authenticated.
    // The /api/calendar route was updated to accept user_id fallback;
    // /api/roster/self-remove now does the same.
    const SIGNUP_ID = "sig-legacy";
    await createSignup({
      id: SIGNUP_ID,
      volunteer_id: "",
      user_id: T.volunteerUid,
    });

    const res = await POST(
      postRequest({
        church_id: T.churchId,
        item_type: "event_signup",
        item_id: SIGNUP_ID,
      }),
    );
    expect(res.status).toBe(200);

    const snap = await adminDb.doc(`event_signups/${SIGNUP_ID}`).get();
    expect(snap.data()?.status).toBe("cancelled");
  });

  it("rejects a self-remove attempt on someone else's signup", async () => {
    const SIGNUP_ID = "sig-other-volunteer";
    await createSignup({
      id: SIGNUP_ID,
      volunteer_id: "p-someone-else",
      user_id: "u-someone-else",
    });

    const res = await POST(
      postRequest({
        church_id: T.churchId,
        item_type: "event_signup",
        item_id: SIGNUP_ID,
      }),
    );
    expect(res.status).toBe(403);

    // Signup should remain confirmed
    const snap = await adminDb.doc(`event_signups/${SIGNUP_ID}`).get();
    expect(snap.data()?.status).toBe("confirmed");
  });

  it("rejects a signup belonging to a different church_id even when owner matches", async () => {
    const SIGNUP_ID = "sig-cross-church";
    await adminDb.collection("event_signups").doc(SIGNUP_ID).set({
      event_id: EVENT_ID,
      church_id: "other-church",
      role_id: ROLE_ID,
      role_title: "Greeter",
      volunteer_id: PERSON_ID,
      user_id: T.volunteerUid,
      volunteer_name: "Alex Kim",
      volunteer_email: "alex@example.com",
      status: "confirmed",
      signed_up_at: new Date().toISOString(),
      approved_by: null,
    });

    const res = await POST(
      postRequest({
        church_id: T.churchId,
        item_type: "event_signup",
        item_id: SIGNUP_ID,
      }),
    );
    expect(res.status).toBe(403);
  });
});
