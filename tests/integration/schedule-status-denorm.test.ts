/**
 * Integration tests for Wave 2.2 schedule_status denormalization (writers).
 *
 * Verifies:
 *   1. POST /api/schedules/{id}/publish fans out `schedule_status: "published"`
 *      to every child assignment regardless of the assignment's own status.
 *   2. PATCH /api/schedules/{id}/approve fans out `schedule_status: "approved"`
 *      when the final ministry approval flips the schedule to "approved" —
 *      but NOT when an individual ministry approval doesn't trigger a
 *      schedule-level transition.
 *   3. POST /api/assignments/claim stamps the parent schedule's current
 *      status onto the new assignment doc.
 *
 * Note: this PR does NOT change firestore.rules. The rule tightening is a
 * follow-up PR (Wave 2.2b) that lands after the backfill script has run
 * against production. These tests just confirm the WRITE PATHS are
 * populating the field correctly — which is the prerequisite for the
 * rule change.
 */

import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";

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

// Stub email + audit so we don't try to reach providers / pollute the test.
vi.mock("@/lib/resend", () => ({
  resend: {
    emails: {
      send: vi.fn(async () => ({ id: "test-msg-id" })),
    },
  },
}));
vi.mock("@/lib/server/audit", () => ({
  audit: vi.fn(async () => {}),
  userActor: (uid: string) => `user:${uid}`,
  SYSTEM_ACTOR: "system",
}));
vi.mock("@/lib/server/outbox", () => ({
  enqueueOutboxEntry: vi.fn(() => {}),
  OUTBOX_DEFAULTS: { MAX_ATTEMPTS: 5, computeNextAttemptAt: () => new Date().toISOString() },
}));
vi.mock("@/lib/services/user-notifications", () => ({
  resolveUserId: vi.fn(async () => null),
  createUserNotification: vi.fn(async () => {}),
  createUserNotificationBatch: vi.fn(async () => {}),
}));

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { POST as publishSchedule } from "@/app/api/schedules/[id]/publish/route";
import { PATCH as approveSchedule } from "@/app/api/schedules/[id]/approve/route";
import { POST as claimAssignment } from "@/app/api/assignments/claim/route";
import { resetFirestore, seedChurchAndMemberships, T } from "./_seed";

const SCHEDULE_ID = "sched1";
const SERVICE_ID = "svc1";
const MINISTRY_ID = "m1";
const ROLE_ID = "vocals";
const PERSON_ID = "p-vol";
const SERVICE_DATE = "2026-09-06"; // Sunday

interface SeedOpts {
  scheduleStatus?: "draft" | "in_review" | "approved" | "published";
  workflowMode?: "centralized" | "self-service";
  /** Pre-existing assignments to seed before the test runs. */
  assignments?: { id: string; status: string; ownerPersonId?: string }[];
  /** Ministry approvals map to seed (for approve-endpoint coverage). */
  ministryApprovals?: Record<string, "pending" | "approved" | "rejected">;
}

async function seedScheduleFixture(opts: SeedOpts = {}): Promise<void> {
  await resetFirestore(adminDb);
  await seedChurchAndMemberships(adminDb);
  const churchRef = adminDb.collection("churches").doc(T.churchId);

  await churchRef.collection("ministries").doc(MINISTRY_ID).set({
    name: "Worship",
  });

  await churchRef.collection("services").doc(SERVICE_ID).set({
    name: "Sunday Worship",
    start_time: "09:00",
    ministries: [
      {
        ministry_id: MINISTRY_ID,
        roles: [{ role_id: ROLE_ID, title: "Vocals", count: 5 }],
      },
    ],
  });

  await churchRef.collection("people").doc(PERSON_ID).set({
    name: "Test Volunteer",
    email: "vol@example.com",
    user_id: T.volunteerUid,
    is_volunteer: true,
    status: "active",
    ministry_ids: [MINISTRY_ID],
    role_ids: [ROLE_ID],
  });

  const ministryApprovals: Record<string, unknown> = {};
  if (opts.ministryApprovals) {
    for (const [mid, status] of Object.entries(opts.ministryApprovals)) {
      ministryApprovals[mid] = {
        status,
        approved_by: status === "approved" ? T.adminUid : null,
        approved_at: status === "approved" ? new Date().toISOString() : null,
        notes: null,
      };
    }
  }

  await churchRef.collection("schedules").doc(SCHEDULE_ID).set({
    status: opts.scheduleStatus ?? "draft",
    workflow_mode: opts.workflowMode ?? "centralized",
    date_range_start: "2026-09-01",
    date_range_end: "2026-12-31",
    ministry_approvals: ministryApprovals,
    created_by: T.adminUid,
    created_at: new Date().toISOString(),
    published_at: null,
    ministry_ids: [MINISTRY_ID],
  });

  for (const a of opts.assignments ?? []) {
    await churchRef.collection("assignments").doc(a.id).set({
      schedule_id: SCHEDULE_ID,
      church_id: T.churchId,
      service_id: SERVICE_ID,
      service_date: SERVICE_DATE,
      ministry_id: MINISTRY_ID,
      role_id: ROLE_ID,
      role_title: "Vocals",
      status: a.status,
      person_id: a.ownerPersonId ?? PERSON_ID,
      volunteer_id: a.ownerPersonId ?? PERSON_ID,
      // Intentionally omitting schedule_status — these are "legacy"
      // pre-Wave-2.2 docs that the publish/approve fan-out should
      // populate.
    });
  }
}

function bearerRequest(url: string, body: object, token: string, method: "POST" | "PATCH" = "POST"): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function getAssignment(id: string) {
  const snap = await adminDb.doc(`churches/${T.churchId}/assignments/${id}`).get();
  return snap.data() ?? null;
}

async function getSchedule() {
  const snap = await adminDb.doc(`churches/${T.churchId}/schedules/${SCHEDULE_ID}`).get();
  return snap.data() ?? null;
}

describe("Wave 2.2 schedule_status denorm — writers", () => {
  beforeAll(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publish fans schedule_status='published' to every child assignment regardless of per-doc status", async () => {
    await seedScheduleFixture({
      scheduleStatus: "approved",
      assignments: [
        { id: "a-draft", status: "draft" },
        { id: "a-confirmed", status: "confirmed" },
        { id: "a-declined", status: "declined" },
      ],
    });

    const req = bearerRequest(
      `https://test/api/schedules/${SCHEDULE_ID}/publish`,
      { church_id: T.churchId },
      T.adminUid,
    );
    const res = await publishSchedule(req, { params: Promise.resolve({ id: SCHEDULE_ID }) });
    expect(res.status).toBe(200);

    // All three child assignments should have schedule_status=published,
    // including the declined one (we're denormalizing the parent's state,
    // not gating on per-doc status).
    for (const id of ["a-draft", "a-confirmed", "a-declined"]) {
      const a = await getAssignment(id);
      expect(a?.schedule_status).toBe("published");
    }

    // Parent schedule itself flipped to published.
    const s = await getSchedule();
    expect(s?.status).toBe("published");
  });

  it("approve fans schedule_status='approved' only when the FINAL ministry approval triggers a schedule-level flip", async () => {
    await seedScheduleFixture({
      scheduleStatus: "in_review",
      ministryApprovals: {
        [MINISTRY_ID]: "pending",
        "m-other": "approved", // already approved by the other ministry
      },
      assignments: [{ id: "a1", status: "draft" }],
    });

    // Approve the remaining pending ministry → all ministries now approved
    const req = bearerRequest(
      `https://test/api/schedules/${SCHEDULE_ID}/approve`,
      { church_id: T.churchId, ministry_id: MINISTRY_ID, status: "approved" },
      T.adminUid,
      "PATCH",
    );
    const res = await approveSchedule(req, { params: Promise.resolve({ id: SCHEDULE_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.all_approved).toBe(true);

    const a = await getAssignment("a1");
    expect(a?.schedule_status).toBe("approved");

    const s = await getSchedule();
    expect(s?.status).toBe("approved");
  });

  it("approve does NOT fan out when a single-ministry approval doesn't flip the schedule status", async () => {
    await seedScheduleFixture({
      scheduleStatus: "in_review",
      ministryApprovals: {
        [MINISTRY_ID]: "pending",
        "m-other": "pending", // still pending → schedule won't flip yet
      },
      assignments: [{ id: "a1", status: "draft" }],
    });

    const req = bearerRequest(
      `https://test/api/schedules/${SCHEDULE_ID}/approve`,
      { church_id: T.churchId, ministry_id: MINISTRY_ID, status: "approved" },
      T.adminUid,
      "PATCH",
    );
    const res = await approveSchedule(req, { params: Promise.resolve({ id: SCHEDULE_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.all_approved).toBe(false);

    // Assignment should NOT have been touched — schedule_status stays absent.
    const a = await getAssignment("a1");
    expect(a?.schedule_status).toBeUndefined();

    // Schedule status itself is still in_review.
    const s = await getSchedule();
    expect(s?.status).toBe("in_review");
  });

  it("self-service claim stamps the parent schedule's current status on the new assignment", async () => {
    await seedScheduleFixture({
      scheduleStatus: "in_review",
      workflowMode: "self-service",
    });

    const req = bearerRequest(
      "https://test/api/assignments/claim",
      {
        church_id: T.churchId,
        schedule_id: SCHEDULE_ID,
        service_id: SERVICE_ID,
        service_date: SERVICE_DATE,
        role_id: ROLE_ID,
        ministry_id: MINISTRY_ID,
      },
      T.volunteerUid,
    );
    const res = await claimAssignment(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBeTruthy();

    const a = await getAssignment(body.id);
    expect(a?.schedule_status).toBe("in_review");
  });
});
