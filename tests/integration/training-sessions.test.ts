/**
 * Integration smoke for /api/training-sessions endpoints.
 *
 * Covers the chain admins use end-to-end:
 *   1. POST            — create a session tied to an org-wide prereq
 *   2. POST /rsvp      — volunteer accepts / declines / hits capacity
 *   3. POST /complete  — mark complete with attendee IDs; the auto-
 *                        complete flag should write the linked prereq
 *                        step as `completed` on each attendee's journey
 *
 * Skips /invite (sends real emails via Resend; covered by manual + the
 * existing prerequisite-eligible-notify email test patterns).
 *
 * Pairs with the new /dashboard/training-sessions admin UI in PR #38.
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
import { POST as CREATE } from "@/app/api/training-sessions/route";
import { POST as RSVP } from "@/app/api/training-sessions/[sessionId]/rsvp/route";
import { POST as COMPLETE } from "@/app/api/training-sessions/[sessionId]/complete/route";
import { ORG_WIDE_MINISTRY_ID } from "@/lib/types";
import { resetFirestore, seedChurchAndMemberships, T } from "./_seed";

const SESSION_ID = "ts1";
const VOL_PERSON_ID_A = "p-vol-a";
const VOL_PERSON_ID_B = "p-vol-b";
const PREREQ_ID = "bg";

function postCreateReq(body: object, token: string = T.adminUid): NextRequest {
  return new NextRequest("https://test/api/training-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function rsvpReq(body: object, token: string = T.volunteerUid): NextRequest {
  return new NextRequest(`https://test/api/training-sessions/${SESSION_ID}/rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function completeReq(body: object, token: string = T.adminUid): NextRequest {
  return new NextRequest(`https://test/api/training-sessions/${SESSION_ID}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

const rsvpParams = Promise.resolve({ sessionId: SESSION_ID });
const completeParams = Promise.resolve({ sessionId: SESSION_ID });

async function seedSession(opts: { capacity?: number; autoComplete?: boolean } = {}) {
  const churchRef = adminDb.collection("churches").doc(T.churchId);

  // Org-wide prereq the session will fulfill.
  await churchRef.update({
    org_prerequisites: [
      { id: PREREQ_ID, label: "Background Check", type: "background_check" },
    ],
  });

  // Two volunteers with the prereq pending. Their Person.user_id is
  // tied to the seeded volunteer UID so the RSVP gate's membership
  // check finds the right record.
  await churchRef.collection("people").doc(VOL_PERSON_ID_A).set({
    name: "Alex",
    email: "alex@example.com",
    user_id: T.volunteerUid,
    is_volunteer: true,
    status: "active",
    ministry_ids: [],
    volunteer_journey: [
      { step_id: PREREQ_ID, ministry_id: ORG_WIDE_MINISTRY_ID, status: "pending" },
    ],
  });
  await churchRef.collection("people").doc(VOL_PERSON_ID_B).set({
    name: "Sam",
    email: "sam@example.com",
    user_id: T.schedulerUid, // re-use the scheduler UID slot so we can hit two distinct callers
    is_volunteer: true,
    status: "active",
    ministry_ids: [],
    volunteer_journey: [
      { step_id: PREREQ_ID, ministry_id: ORG_WIDE_MINISTRY_ID, status: "pending" },
    ],
  });

  await churchRef.collection("training_sessions").doc(SESSION_ID).set({
    church_id: T.churchId,
    prerequisite_step_id: PREREQ_ID,
    ministry_id: ORG_WIDE_MINISTRY_ID,
    title: "Safe Sanctuary Training",
    date: "2026-09-15",
    start_time: "10:00",
    end_time: "11:30",
    location: "Fellowship Hall",
    capacity: opts.capacity ?? 0,
    auto_complete: opts.autoComplete ?? true,
    status: "scheduled",
    rsvps: [],
    attendee_ids: [],
    created_by: T.adminUid,
    created_at: new Date().toISOString(),
  });
}

beforeEach(async () => {
  await resetFirestore(adminDb);
  await seedChurchAndMemberships(adminDb);
});

describe("POST /api/training-sessions — create", () => {
  it("401 without bearer", async () => {
    const req = new NextRequest("https://test/api/training-sessions", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await CREATE(req);
    expect(res.status).toBe(401);
  });

  it("400 missing required fields", async () => {
    const res = await CREATE(postCreateReq({ church_id: T.churchId }));
    expect(res.status).toBe(400);
  });

  it("403 when caller is a plain volunteer (scheduler+ required)", async () => {
    const res = await CREATE(
      postCreateReq(
        {
          church_id: T.churchId,
          prerequisite_step_id: PREREQ_ID,
          ministry_id: ORG_WIDE_MINISTRY_ID,
          title: "X",
          date: "2026-09-15",
          start_time: "10:00",
          end_time: "11:00",
          location: "Y",
        },
        T.volunteerUid,
      ),
    );
    expect(res.status).toBe(403);
  });

  it("admin can create a session and the doc lands in Firestore", async () => {
    const res = await CREATE(
      postCreateReq({
        church_id: T.churchId,
        prerequisite_step_id: PREREQ_ID,
        ministry_id: ORG_WIDE_MINISTRY_ID,
        title: "Safe Sanctuary",
        date: "2026-09-15",
        start_time: "10:00",
        end_time: "11:30",
        location: "Fellowship Hall",
        capacity: 12,
        auto_complete: true,
      }),
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const doc = await adminDb
      .doc(`churches/${T.churchId}/training_sessions/${id}`)
      .get();
    expect(doc.exists).toBe(true);
    expect(doc.data()?.status).toBe("scheduled");
    expect(doc.data()?.auto_complete).toBe(true);
    expect(doc.data()?.rsvps).toEqual([]);
  });
});

describe("POST /api/training-sessions/[id]/rsvp", () => {
  it("Alex accepts → rsvps array contains her acceptance", async () => {
    await seedSession();
    const res = await RSVP(
      rsvpReq({ church_id: T.churchId, volunteer_id: VOL_PERSON_ID_A, status: "accepted" }),
      { params: rsvpParams },
    );
    expect(res.status).toBe(200);
    const sess = await adminDb
      .doc(`churches/${T.churchId}/training_sessions/${SESSION_ID}`)
      .get();
    const rsvps = sess.data()?.rsvps as { volunteer_id: string; status: string }[];
    expect(rsvps).toHaveLength(1);
    expect(rsvps[0].volunteer_id).toBe(VOL_PERSON_ID_A);
    expect(rsvps[0].status).toBe("accepted");
  });

  it("Alex flips accepted → declined → only the latest persists", async () => {
    await seedSession();
    await RSVP(
      rsvpReq({ church_id: T.churchId, volunteer_id: VOL_PERSON_ID_A, status: "accepted" }),
      { params: rsvpParams },
    );
    await RSVP(
      rsvpReq({ church_id: T.churchId, volunteer_id: VOL_PERSON_ID_A, status: "declined" }),
      { params: rsvpParams },
    );
    const sess = await adminDb
      .doc(`churches/${T.churchId}/training_sessions/${SESSION_ID}`)
      .get();
    const rsvps = sess.data()?.rsvps as { volunteer_id: string; status: string }[];
    expect(rsvps).toHaveLength(1);
    expect(rsvps[0].status).toBe("declined");
  });

  it("409 when capacity 1 is full and a NEW acceptance comes in", async () => {
    await seedSession({ capacity: 1 });
    // Alex grabs the single spot
    expect(
      (await RSVP(
        rsvpReq({ church_id: T.churchId, volunteer_id: VOL_PERSON_ID_A, status: "accepted" }),
        { params: rsvpParams },
      )).status,
    ).toBe(200);
    // Sam can't get in
    const res = await RSVP(
      rsvpReq(
        { church_id: T.churchId, volunteer_id: VOL_PERSON_ID_B, status: "accepted" },
        T.schedulerUid,
      ),
      { params: rsvpParams },
    );
    expect(res.status).toBe(409);
  });

  it("400 for invalid status value", async () => {
    await seedSession();
    const res = await RSVP(
      rsvpReq({ church_id: T.churchId, volunteer_id: VOL_PERSON_ID_A, status: "maybe" }),
      { params: rsvpParams },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/training-sessions/[id]/complete", () => {
  it("403 when caller is a plain volunteer", async () => {
    await seedSession();
    const res = await COMPLETE(
      completeReq(
        { church_id: T.churchId, attendee_ids: [VOL_PERSON_ID_A] },
        T.volunteerUid,
      ),
      { params: completeParams },
    );
    expect(res.status).toBe(403);
  });

  it("marks session completed and auto-completes attendee prereq (when auto_complete: true)", async () => {
    await seedSession({ autoComplete: true });

    const res = await COMPLETE(
      completeReq({
        church_id: T.churchId,
        attendee_ids: [VOL_PERSON_ID_A, VOL_PERSON_ID_B],
      }),
      { params: completeParams },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.attendees_marked).toBe(2);
    expect(data.steps_completed).toBe(2);

    // Session doc updated
    const sess = await adminDb
      .doc(`churches/${T.churchId}/training_sessions/${SESSION_ID}`)
      .get();
    expect(sess.data()?.status).toBe("completed");
    expect(sess.data()?.attendee_ids).toEqual([VOL_PERSON_ID_A, VOL_PERSON_ID_B]);

    // Alex's journey step is now completed
    const alex = await adminDb
      .doc(`churches/${T.churchId}/people/${VOL_PERSON_ID_A}`)
      .get();
    const journey = alex.data()?.volunteer_journey as Array<{ step_id: string; status: string }>;
    expect(journey.find((s) => s.step_id === PREREQ_ID)?.status).toBe("completed");
  });

  it("does NOT auto-complete prereqs when auto_complete is false (admin only updates the session)", async () => {
    await seedSession({ autoComplete: false });
    const res = await COMPLETE(
      completeReq({
        church_id: T.churchId,
        attendee_ids: [VOL_PERSON_ID_A],
      }),
      { params: completeParams },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.steps_completed).toBe(0);

    const alex = await adminDb
      .doc(`churches/${T.churchId}/people/${VOL_PERSON_ID_A}`)
      .get();
    const journey = alex.data()?.volunteer_journey as Array<{ step_id: string; status: string }>;
    // Journey step is still pending.
    expect(journey.find((s) => s.step_id === PREREQ_ID)?.status).toBe("pending");
  });
});
