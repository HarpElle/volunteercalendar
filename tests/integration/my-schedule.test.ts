/**
 * Integration smoke for GET /api/my-schedule (Wave 5 Batch E phase 3).
 *
 * This endpoint is the authorized server-side read path that lets us
 * lock down the assignment rule. The tests here lock in the
 * SECURITY-CRITICAL behaviors that must be correct before the rule
 * ships:
 *
 *   - Self-signup carve-out: a volunteer's OWN self_signup claim on a
 *     DRAFT schedule IS returned (they just clicked Sign Up).
 *   - Scheduler-pushed assignments on a non-published schedule are NOT
 *     returned (admin drafts must not leak pre-publish).
 *   - Published scheduler assignments ARE returned.
 *   - teamAssignments returns all church assignments (feeds team view).
 *   - Cross-user isolation: the caller only ever sees data for churches
 *     they're an active member of (church list derived from their own
 *     memberships, not a param).
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
import { GET } from "@/app/api/my-schedule/route";
import { resetFirestore, seedChurchAndMemberships, T } from "./_seed";

// The volunteer seeded by _seed.ts is T.volunteerUid with an active
// membership in T.churchId. We give them a Person doc + assignments.
const PERSON_ID = "p-vol-me";

function authedRequest(token: string): NextRequest {
  return new NextRequest("https://test/api/my-schedule", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

async function seedPersonAndSchedules() {
  // Link the seeded volunteer membership to a Person doc.
  await adminDb
    .doc(`memberships/${T.volunteerUid}_${T.churchId}`)
    .update({ volunteer_id: PERSON_ID });
  await adminDb
    .collection(`churches/${T.churchId}/people`)
    .doc(PERSON_ID)
    .set({
      church_id: T.churchId,
      name: "Volunteer Me",
      user_id: T.volunteerUid,
      is_volunteer: true,
      status: "active",
      ministry_ids: ["m1"],
    });

  // A published scheduler schedule + a draft scheduler schedule +
  // a draft self-service schedule.
  const mk = (id: string, status: string, mode: string) =>
    adminDb.doc(`churches/${T.churchId}/schedules/${id}`).set({
      id,
      church_id: T.churchId,
      status,
      workflow_mode: mode,
      date_range_start: futureDate(0),
      date_range_end: futureDate(30),
    });
  await mk("sched-pub", "published", "centralized");
  await mk("sched-draft", "draft", "centralized");
  await mk("sched-ss", "draft", "self-service");
}

async function seedAssignment(
  id: string,
  scheduleId: string,
  personId: string,
  signupType: string | null,
) {
  await adminDb.collection(`churches/${T.churchId}/assignments`).doc(id).set({
    id,
    church_id: T.churchId,
    schedule_id: scheduleId,
    person_id: personId,
    service_id: "svc1",
    service_date: futureDate(7),
    role_title: "Greeter",
    status: "confirmed",
    ...(signupType ? { signup_type: signupType } : {}),
  });
}

beforeEach(async () => {
  await resetFirestore(adminDb);
  await seedChurchAndMemberships(adminDb);
  await seedPersonAndSchedules();
});

describe("GET /api/my-schedule", () => {
  it("401 without a bearer token", async () => {
    const req = new NextRequest("https://test/api/my-schedule", {
      method: "GET",
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns the volunteer's published scheduler assignment", async () => {
    await seedAssignment("a-pub", "sched-pub", PERSON_ID, null);
    const res = await GET(authedRequest(T.volunteerUid));
    expect(res.status).toBe(200);
    const data = await res.json();
    const ids = data.assignments.map((a: { id: string }) => a.id);
    expect(ids).toContain("a-pub");
  });

  it("carve-out: returns the volunteer's OWN self_signup claim on a DRAFT schedule", async () => {
    await seedAssignment("a-ss", "sched-ss", PERSON_ID, "self_signup");
    const res = await GET(authedRequest(T.volunteerUid));
    const data = await res.json();
    const ids = data.assignments.map((a: { id: string }) => a.id);
    expect(ids).toContain("a-ss");
  });

  it("hides scheduler-pushed assignments on a non-published (draft) schedule", async () => {
    await seedAssignment("a-draft", "sched-draft", PERSON_ID, null);
    const res = await GET(authedRequest(T.volunteerUid));
    const data = await res.json();
    const ids = data.assignments.map((a: { id: string }) => a.id);
    expect(ids).not.toContain("a-draft");
  });

  it("teamAssignments includes ALL church assignments (feeds team view + open slots)", async () => {
    await seedAssignment("a-pub", "sched-pub", PERSON_ID, null);
    await seedAssignment("a-draft", "sched-draft", "p-someone-else", null);
    await seedAssignment("a-ss", "sched-ss", PERSON_ID, "self_signup");
    const res = await GET(authedRequest(T.volunteerUid));
    const data = await res.json();
    const teamIds = data.teamAssignments.map((a: { id: string }) => a.id).sort();
    // team view sees everything regardless of carve-out (it's read via
    // the Admin SDK server-side; the page renders names, not edit access)
    expect(teamIds).toEqual(["a-draft", "a-pub", "a-ss"]);
  });

  it("returns self-service draft schedules for the Open Slots tab", async () => {
    const res = await GET(authedRequest(T.volunteerUid));
    const data = await res.json();
    const ssIds = data.selfServiceSchedules.map((s: { id: string }) => s.id);
    expect(ssIds).toContain("sched-ss");
    // centralized drafts should NOT be in the self-service list
    expect(ssIds).not.toContain("sched-draft");
  });

  it("cross-user isolation: a user with no active membership sees empty data", async () => {
    // u-stranger has no membership in any seeded church.
    const res = await GET(authedRequest("u-stranger"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.assignments).toEqual([]);
    expect(data.teamAssignments).toEqual([]);
    expect(data.myVolunteerId).toBeNull();
  });
});
