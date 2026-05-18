/**
 * Integration smoke for POST + DELETE /api/assignments/claim.
 *
 * The volunteer-facing claim flow for Self-Service drafts (PR #35,
 * Phase 6 follow-up #3). The handler does the heaviest lifting in the
 * codebase to date: it reads schedule + service + ministry + church +
 * existing-assignment-count under a single Firestore transaction, then
 * writes a new assignment with signup_type "self_signup".
 *
 * These tests cover:
 *   - auth + membership gates (401/403)
 *   - missing-fields (400)
 *   - workflow-mode + status gates (409 when published or non-self-service)
 *   - eligibility gates (not-on-team, expired prereq)
 *   - capacity gate (409 when role.count slots already filled)
 *   - double-booking gate (volunteer can't claim two slots on the same
 *     service occurrence)
 *   - happy path (201) + the assignment lands in Firestore
 *   - DELETE release (only the claimant + only while still in draft)
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
import { POST, DELETE } from "@/app/api/assignments/claim/route";
import { ORG_WIDE_MINISTRY_ID } from "@/lib/types";
import {
  resetFirestore,
  seedChurchAndMemberships,
  T,
} from "./_seed";

const SCHEDULE_ID = "s1";
const SERVICE_ID = "svc1";
const MINISTRY_ID = "m1";
const ROLE_ID = "vocals";
const SERVICE_DATE = "2026-09-06"; // Sunday
const VOL_PERSON_ID = "p-vol";

function postRequest(body: object, token: string = T.volunteerUid): NextRequest {
  return new NextRequest("https://test/api/assignments/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function deleteRequest(
  churchId: string,
  assignmentId: string,
  token: string = T.volunteerUid,
): NextRequest {
  return new NextRequest(
    `https://test/api/assignments/claim?church_id=${churchId}&assignment_id=${assignmentId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

function happyBody(overrides: Record<string, string> = {}) {
  return {
    church_id: T.churchId,
    schedule_id: SCHEDULE_ID,
    service_id: SERVICE_ID,
    service_date: SERVICE_DATE,
    role_id: ROLE_ID,
    ministry_id: MINISTRY_ID,
    ...overrides,
  };
}

async function seedFixture(opts: {
  workflowMode?: string;
  scheduleStatus?: string;
  roleCount?: number;
  preExistingClaims?: number;
  volunteerOnTeam?: boolean;
  expiredPrereq?: boolean;
}) {
  const {
    workflowMode = "self-service",
    scheduleStatus = "draft",
    roleCount = 1,
    preExistingClaims = 0,
    volunteerOnTeam = true,
    expiredPrereq = false,
  } = opts;

  await resetFirestore(adminDb);
  await seedChurchAndMemberships(adminDb);

  // Add org-wide prereq with optional expiry test setup.
  if (expiredPrereq) {
    await adminDb.collection("churches").doc(T.churchId).update({
      org_prerequisites: [
        { id: "bg", label: "Background Check", type: "background_check", expires_in_days: 365 },
      ],
    });
  }

  // Self-service schedule.
  await adminDb
    .collection("churches")
    .doc(T.churchId)
    .collection("schedules")
    .doc(SCHEDULE_ID)
    .set({
      church_id: T.churchId,
      date_range_start: "2026-09-01",
      date_range_end: "2026-09-30",
      status: scheduleStatus,
      workflow_mode: workflowMode,
      created_by: T.adminUid,
      created_at: new Date().toISOString(),
      published_at: null,
      ministry_approvals: {},
      ministry_ids: [],
    });

  // Service with a single role on a single ministry, Sunday.
  await adminDb
    .collection("churches")
    .doc(T.churchId)
    .collection("services")
    .doc(SERVICE_ID)
    .set({
      church_id: T.churchId,
      name: "Sunday Worship",
      ministry_id: MINISTRY_ID,
      ministries: null,
      day_of_week: 0,
      start_time: "10:00",
      end_time: "11:30",
      recurrence: "weekly",
      roles: [{ role_id: ROLE_ID, title: "Vocalist", count: roleCount }],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  // Ministry.
  await adminDb
    .collection("churches")
    .doc(T.churchId)
    .collection("ministries")
    .doc(MINISTRY_ID)
    .set({
      church_id: T.churchId,
      name: "Worship Team",
      color: "#ff7a59",
      description: "",
      lead_user_id: T.adminUid,
      lead_email: "lead@example.com",
      requires_background_check: false,
      prerequisites: [],
      created_at: new Date().toISOString(),
    });

  // The caller's Person record (volunteer).
  await adminDb
    .collection("churches")
    .doc(T.churchId)
    .collection("people")
    .doc(VOL_PERSON_ID)
    .set({
      name: "Test Volunteer",
      email: "vol@example.com",
      phone: null,
      photo_url: null,
      church_id: T.churchId,
      user_id: T.volunteerUid,
      is_volunteer: true,
      status: "active",
      ministry_ids: volunteerOnTeam ? [MINISTRY_ID] : [],
      role_ids: [],
      campus_ids: [],
      household_ids: [],
      scheduling_profile: null,
      child_profile: null,
      stats: null,
      imported_from: "manual",
      background_check: null,
      role_constraints: null,
      volunteer_journey: expiredPrereq
        ? [
            {
              step_id: "bg",
              ministry_id: ORG_WIDE_MINISTRY_ID,
              status: "completed",
              completed_at: "2024-01-01T00:00:00Z",
              expires_at: "2025-01-01T00:00:00Z", // long expired
              verified_by: T.adminUid,
              notes: null,
            },
          ]
        : [],
      qr_token: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

  // Pre-existing claims (to test capacity gates).
  for (let i = 0; i < preExistingClaims; i++) {
    await adminDb
      .collection("churches")
      .doc(T.churchId)
      .collection("assignments")
      .add({
        schedule_id: SCHEDULE_ID,
        church_id: T.churchId,
        service_id: SERVICE_ID,
        event_id: null,
        service_date: SERVICE_DATE,
        volunteer_id: `other-vol-${i}`,
        person_id: `other-vol-${i}`,
        role_id: ROLE_ID,
        role_title: "Vocalist",
        ministry_id: MINISTRY_ID,
        status: "confirmed",
        signup_type: "self_signup",
        assignment_type: "regular",
        confirmation_token: `tok-${i}`,
        responded_at: new Date().toISOString(),
        reminder_sent_at: [],
        attended: null,
        attended_at: null,
      });
  }
}

beforeEach(async () => {
  await seedFixture({});
});

describe("POST /api/assignments/claim — auth + validation", () => {
  it("401 without a bearer token", async () => {
    const req = new NextRequest("https://test/api/assignments/claim", {
      method: "POST",
      body: JSON.stringify(happyBody()),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("400 when required fields are missing", async () => {
    const res = await POST(postRequest({ church_id: T.churchId }));
    expect(res.status).toBe(400);
  });

  it("403 when caller has no membership in the requested church", async () => {
    const res = await POST(postRequest(happyBody({ church_id: "other-church" })));
    expect(res.status).toBe(403);
  });

  it("403 when caller has no Person record in the church (admin not a volunteer)", async () => {
    const res = await POST(postRequest(happyBody(), T.adminUid));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/assignments/claim — schedule + workflow gates", () => {
  it("404 when schedule does not exist", async () => {
    const res = await POST(postRequest(happyBody({ schedule_id: "missing-sched" })));
    expect(res.status).toBe(404);
  });

  it("409 when the schedule is not self-service", async () => {
    await seedFixture({ workflowMode: "centralized" });
    const res = await POST(postRequest(happyBody()));
    expect(res.status).toBe(409);
  });

  it("409 when the schedule is already published", async () => {
    await seedFixture({ scheduleStatus: "published" });
    const res = await POST(postRequest(happyBody()));
    expect(res.status).toBe(409);
  });

  it("400 when service_date is outside the schedule date range", async () => {
    const res = await POST(
      postRequest(happyBody({ service_date: "2027-01-04" })),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/assignments/claim — eligibility", () => {
  it("403 when volunteer is not on the team", async () => {
    await seedFixture({ volunteerOnTeam: false });
    const res = await POST(postRequest(happyBody()));
    expect(res.status).toBe(403);
  });

  it("403 when volunteer's prereq is expired (compliance gate from PR #33)", async () => {
    await seedFixture({ expiredPrereq: true });
    const res = await POST(postRequest(happyBody()));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/assignments/claim — capacity + race", () => {
  it("409 when the slot is already filled (role.count = 1, one existing claim)", async () => {
    await seedFixture({ roleCount: 1, preExistingClaims: 1 });
    const res = await POST(postRequest(happyBody()));
    expect(res.status).toBe(409);
  });

  it("happy path: claims an open slot and writes a self_signup confirmed assignment", async () => {
    const res = await POST(postRequest(happyBody()));
    expect(res.status).toBe(200);
    const { id } = await res.json();
    const doc = await adminDb
      .collection("churches")
      .doc(T.churchId)
      .collection("assignments")
      .doc(id)
      .get();
    expect(doc.exists).toBe(true);
    const data = doc.data()!;
    expect(data.signup_type).toBe("self_signup");
    expect(data.status).toBe("confirmed");
    expect(data.person_id).toBe(VOL_PERSON_ID);
    expect(data.role_id).toBe(ROLE_ID);
  });

  it("409 when the same volunteer claims twice on the same occurrence", async () => {
    expect((await POST(postRequest(happyBody()))).status).toBe(200);
    const res = await POST(postRequest(happyBody()));
    expect(res.status).toBe(409);
  });

  it("respects role.count > 1 (second slot still openable)", async () => {
    await seedFixture({ roleCount: 2 });
    // First volunteer claims
    const first = await POST(postRequest(happyBody()));
    expect(first.status).toBe(200);
    // Second slot still claimable — but the SAME volunteer can't double up;
    // we already test that. So pretend the existing claim was someone else
    // by seeding a pre-existing one and claiming.
    await seedFixture({ roleCount: 2, preExistingClaims: 1 });
    const second = await POST(postRequest(happyBody()));
    expect(second.status).toBe(200);
    // Now both filled.
    await seedFixture({ roleCount: 2, preExistingClaims: 2 });
    const third = await POST(postRequest(happyBody()));
    expect(third.status).toBe(409);
  });
});

describe("DELETE /api/assignments/claim — release", () => {
  it("deletes the caller's own claim while schedule is draft", async () => {
    const createRes = await POST(postRequest(happyBody()));
    const { id } = await createRes.json();
    const delRes = await DELETE(deleteRequest(T.churchId, id));
    expect(delRes.status).toBe(200);
    const doc = await adminDb
      .collection("churches")
      .doc(T.churchId)
      .collection("assignments")
      .doc(id)
      .get();
    expect(doc.exists).toBe(false);
  });

  it("403 when trying to release someone else's claim", async () => {
    const createRes = await POST(postRequest(happyBody()));
    const { id } = await createRes.json();
    // schedulerUid has no Person record, so it'll mismatch person_id
    const delRes = await DELETE(deleteRequest(T.churchId, id, T.schedulerUid));
    expect(delRes.status).toBe(403);
  });

  it("409 once the schedule moves past draft (e.g. in_review)", async () => {
    const createRes = await POST(postRequest(happyBody()));
    const { id } = await createRes.json();
    await adminDb
      .collection("churches")
      .doc(T.churchId)
      .collection("schedules")
      .doc(SCHEDULE_ID)
      .update({ status: "in_review" });
    const delRes = await DELETE(deleteRequest(T.churchId, id));
    expect(delRes.status).toBe(409);
  });

  it("400 when missing query params", async () => {
    const req = new NextRequest("https://test/api/assignments/claim", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${T.volunteerUid}` },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });
});
