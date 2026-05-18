/**
 * Integration smoke for PATCH /api/assignments/[id]. Proves the harness
 * handles:
 *   - dynamic route params (`{ params: { id } }`)
 *   - sub-collection paths (`churches/{churchId}/assignments`)
 *   - the scheduler+ role gate (admin AND scheduler should pass; volunteer
 *     should not)
 *
 * The trainee-toggle behavior shipped in PR #27 and the route is the only
 * write surface for `assignment_type`. Lock the contract here.
 */

import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("@/lib/firebase/admin", async () => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  const { initializeApp, getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app =
    getApps()[0] ??
    initializeApp({ projectId: "demo-test" });
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
import { PATCH } from "@/app/api/assignments/[id]/route";
import {
  resetFirestore,
  seedChurchAndMemberships,
  T,
} from "./_seed";

const ASSIGNMENT_ID = "test-assignment-1";

function jsonRequest(body: object, token: string = T.adminUid): NextRequest {
  return new NextRequest(`https://test/api/assignments/${ASSIGNMENT_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: ASSIGNMENT_ID });

beforeEach(async () => {
  // Reset + reseed everything in beforeEach so test files don't depend
  // on sibling-file ordering. Then seed one assignment for this file.
  await resetFirestore(adminDb);
  await seedChurchAndMemberships(adminDb);
  await adminDb
    .collection("churches")
    .doc(T.churchId)
    .collection("assignments")
    .doc(ASSIGNMENT_ID)
    .set({
      schedule_id: "s1",
      church_id: T.churchId,
      service_id: "svc1",
      event_id: null,
      service_date: "2026-09-06",
      volunteer_id: "vol1",
      person_id: "vol1",
      role_id: "vocals",
      role_title: "Vocalist",
      ministry_id: "worship",
      status: "draft",
      signup_type: "scheduled",
      assignment_type: "regular",
      attended: null,
      attended_at: null,
    });
});

describe("PATCH /api/assignments/[id]", () => {
  it("rejects without bearer token (401)", async () => {
    const req = new NextRequest(`https://test/api/assignments/${ASSIGNMENT_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ church_id: T.churchId, assignment_type: "trainee" }),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(401);
  });

  it("rejects missing church_id (400)", async () => {
    const res = await PATCH(jsonRequest({ assignment_type: "trainee" }), { params });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid assignment_type value (400)", async () => {
    const res = await PATCH(
      jsonRequest({ church_id: T.churchId, assignment_type: "supervisor" }),
      { params },
    );
    expect(res.status).toBe(400);
  });

  it("rejects volunteer role (403)", async () => {
    const res = await PATCH(
      jsonRequest(
        { church_id: T.churchId, assignment_type: "trainee" },
        T.volunteerUid,
      ),
      { params },
    );
    expect(res.status).toBe(403);
  });

  it("admin can flip an assignment to trainee", async () => {
    const res = await PATCH(
      jsonRequest({ church_id: T.churchId, assignment_type: "trainee" }),
      { params },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.assignment_type).toBe("trainee");

    const doc = await adminDb
      .collection("churches")
      .doc(T.churchId)
      .collection("assignments")
      .doc(ASSIGNMENT_ID)
      .get();
    expect(doc.data()?.assignment_type).toBe("trainee");
  });

  it("scheduler can also flip an assignment (role gate is scheduler+)", async () => {
    const res = await PATCH(
      jsonRequest(
        { church_id: T.churchId, assignment_type: "trainee" },
        T.schedulerUid,
      ),
      { params },
    );
    expect(res.status).toBe(200);
  });

  it("flipping back to regular works", async () => {
    // Set to trainee first
    await PATCH(
      jsonRequest({ church_id: T.churchId, assignment_type: "trainee" }),
      { params },
    );
    // Flip back
    const res = await PATCH(
      jsonRequest({ church_id: T.churchId, assignment_type: "regular" }),
      { params },
    );
    expect(res.status).toBe(200);

    const doc = await adminDb
      .collection("churches")
      .doc(T.churchId)
      .collection("assignments")
      .doc(ASSIGNMENT_ID)
      .get();
    expect(doc.data()?.assignment_type).toBe("regular");
  });

  it("404 when the assignment does not exist", async () => {
    const otherParams = Promise.resolve({ id: "does-not-exist" });
    const req = new NextRequest("https://test/api/assignments/does-not-exist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${T.adminUid}` },
      body: JSON.stringify({ church_id: T.churchId, assignment_type: "trainee" }),
    });
    const res = await PATCH(req, { params: otherParams });
    expect(res.status).toBe(404);
  });
});
