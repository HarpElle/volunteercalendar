/**
 * Integration smoke for POST /api/reminders idempotency (Wave 2.1).
 *
 * Replaces the array-append pattern (race between concurrent cron
 * invocations could both pass the filter and both dispatch) with a
 * per-(assignment, kind, channel) claim inside a Firestore transaction.
 *
 * Coverage:
 *   1. Happy path: first call sends 1 email; reminder_dispatches map has
 *      `reminder_48h_email = sent`.
 *   2. Idempotency: second call within the same window sends 0 (skipped
 *      because the email slot is already claimed).
 *   3. Per-channel independence: an assignment whose email is already
 *      sent can STILL have its SMS claimed and dispatched on a follow-up
 *      call after the volunteer adds a phone number / sms channel pref.
 *   4. Legacy backstop: an assignment with an existing reminder_sent_at
 *      array entry for this kind is treated as already-sent (the legacy
 *      shape is what previous deploys wrote). The dispatch is skipped
 *      AND the new shape is backfilled with `backfilled_from: legacy_array`.
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

// Stub the email + SMS dispatchers so the tests don't try to reach real
// providers. We don't care about template rendering here — that's covered
// by unit tests; idempotency is the point.
const mockEmailSend = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ id: "test-msg-id" }),
);
vi.mock("@/lib/resend", () => ({
  resend: {
    emails: {
      send: (...args: unknown[]) => mockEmailSend(...args),
    },
  },
}));

const mockSendSms = vi.fn((..._args: unknown[]) =>
  Promise.resolve({
    success: true,
    sid: "SMtest",
    error: null,
  }),
);
vi.mock("@/lib/services/sms", () => ({
  sendSms: (...args: unknown[]) => mockSendSms(...args),
}));

// Stub the in-app notification path — the test doesn't care whether the
// user_notifications collection gets a row; we just don't want it to error.
vi.mock("@/lib/services/user-notifications", () => ({
  resolveUserId: vi.fn(async () => null),
  createUserNotification: vi.fn(async () => {}),
  createUserNotificationBatch: vi.fn(async () => {}),
}));

import { adminDb } from "@/lib/firebase/admin";
import { POST } from "@/app/api/reminders/route";
import { resetFirestore, seedChurchAndMemberships, T } from "./_seed";

const PERSON_ID = "p-vol";
const SERVICE_ID = "svc1";
const MINISTRY_ID = "m1";
const ROLE_ID = "vocals";

/**
 * Reminders fire 48h before the target service. Pick a date 48h from now
 * (rounded to the start of UTC day to match the route's targetDateStr
 * calculation).
 */
function targetDateStr(hoursAhead = 48): string {
  return new Date(Date.now() + hoursAhead * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
}

interface SeedOpts {
  /** Override the volunteer's reminder channel prefs. */
  channels?: string[];
  /** Pre-seed a legacy reminder_sent_at entry to exercise the backstop. */
  legacySentKind?: "reminder_48h" | "reminder_24h";
}

async function seedReminderFixture(opts: SeedOpts = {}): Promise<string> {
  await resetFirestore(adminDb);
  await seedChurchAndMemberships(adminDb);

  const churchRef = adminDb.collection("churches").doc(T.churchId);

  await churchRef.collection("people").doc(PERSON_ID).set({
    name: "Vol Test",
    email: "vol@example.com",
    phone: "+15555550100",
    user_id: T.volunteerUid,
    is_volunteer: true,
    status: "active",
    reminder_preferences: opts.channels
      ? { channels: opts.channels }
      : { channels: ["email"] },
  });

  await churchRef.collection("services").doc(SERVICE_ID).set({
    name: "Sunday Worship",
    start_time: "09:00",
  });

  await churchRef.collection("ministries").doc(MINISTRY_ID).set({
    name: "Worship",
  });

  const date = targetDateStr(48);
  const assignmentId = "a1";
  const data: Record<string, unknown> = {
    person_id: PERSON_ID,
    volunteer_id: PERSON_ID,
    service_id: SERVICE_ID,
    ministry_id: MINISTRY_ID,
    role_id: ROLE_ID,
    role_title: "Vocals",
    service_date: date,
    status: "confirmed",
    schedule_id: "sched1",
    confirmation_token: "tok-1",
  };
  if (opts.legacySentKind) {
    data.reminder_sent_at = [`${opts.legacySentKind}:2026-05-20T12:00:00.000Z`];
  }
  await churchRef.collection("assignments").doc(assignmentId).set(data);

  return assignmentId;
}

function postRequest(body: object, useCronSecret = true): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (useCronSecret) headers["x-cron-secret"] = "test-cron-secret";
  return new Request("https://test/api/reminders", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function getAssignment(assignmentId: string) {
  const snap = await adminDb
    .doc(`churches/${T.churchId}/assignments/${assignmentId}`)
    .get();
  return snap.data() ?? null;
}

describe("POST /api/reminders — idempotency (Wave 2.1)", () => {
  beforeAll(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
  });

  beforeEach(() => {
    mockEmailSend.mockClear();
    mockSendSms.mockClear();
  });

  it("happy path: first call sends 1 email; reminder_dispatches map is populated", async () => {
    const id = await seedReminderFixture({ channels: ["email"] });

    const res = await POST(postRequest({ church_id: T.churchId, hours: 48 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.sent_email).toBe(1);
    expect(body.sent_sms).toBe(0);
    expect(mockEmailSend).toHaveBeenCalledTimes(1);

    const after = await getAssignment(id);
    const dispatches = after?.reminder_dispatches as Record<string, { status: string }>;
    expect(dispatches?.reminder_48h_email?.status).toBe("sent");
  });

  it("idempotency: second call with no state change sends 0 (skipped)", async () => {
    const id = await seedReminderFixture({ channels: ["email"] });

    const res1 = await POST(postRequest({ church_id: T.churchId, hours: 48 }));
    expect(res1.status).toBe(200);
    expect((await res1.json()).sent_email).toBe(1);
    expect(mockEmailSend).toHaveBeenCalledTimes(1);

    const res2 = await POST(postRequest({ church_id: T.churchId, hours: 48 }));
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.sent_email).toBe(0);
    expect(body2.skipped).toBeGreaterThanOrEqual(1);
    expect(mockEmailSend).toHaveBeenCalledTimes(1); // unchanged

    const after = await getAssignment(id);
    const dispatches = after?.reminder_dispatches as Record<string, { status: string }>;
    expect(dispatches?.reminder_48h_email?.status).toBe("sent");
  });

  it("per-channel: email-already-sent doesn't block SMS on a follow-up call", async () => {
    const id = await seedReminderFixture({ channels: ["email"] });

    // First call sends just email.
    const res1 = await POST(postRequest({ church_id: T.churchId, hours: 48 }));
    expect((await res1.json()).sent_email).toBe(1);
    expect(mockEmailSend).toHaveBeenCalledTimes(1);
    expect(mockSendSms).not.toHaveBeenCalled();

    // The volunteer now switches to multi-channel. Phase 2 moved the
    // source of truth from people/{id}.reminder_preferences (the field
    // Cursor F-002 flagged as wrong) to memberships/{uid_churchId}.
    // reminder_preferences. The Account page Settings UI already
    // writes to memberships in production.
    await adminDb
      .doc(`memberships/${T.volunteerUid}_${T.churchId}`)
      .update({ reminder_preferences: { channels: ["email", "sms"] } });

    const res2 = await POST(postRequest({ church_id: T.churchId, hours: 48 }));
    const body2 = await res2.json();
    // Email slot was already claimed → still 0 new email sends
    expect(body2.sent_email).toBe(0);
    // SMS slot was untouched → 1 new SMS dispatch
    expect(body2.sent_sms).toBe(1);
    expect(mockEmailSend).toHaveBeenCalledTimes(1);
    expect(mockSendSms).toHaveBeenCalledTimes(1);

    const after = await getAssignment(id);
    const dispatches = after?.reminder_dispatches as Record<string, { status: string }>;
    expect(dispatches?.reminder_48h_email?.status).toBe("sent");
    expect(dispatches?.reminder_48h_sms?.status).toBe("sent");
  });

  it("legacy-grace: assignment with legacy reminder_sent_at entry is skipped + backfilled", async () => {
    const id = await seedReminderFixture({
      channels: ["email"],
      legacySentKind: "reminder_48h",
    });

    const res = await POST(postRequest({ church_id: T.churchId, hours: 48 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Legacy entry blocked the dispatch
    expect(body.sent_email).toBe(0);
    expect(mockEmailSend).not.toHaveBeenCalled();

    const after = await getAssignment(id);
    const dispatches = after?.reminder_dispatches as Record<
      string,
      { status: string; backfilled_from?: string }
    >;
    // New shape was backfilled so future calls don't pay the legacy-check cost
    expect(dispatches?.reminder_48h_email?.status).toBe("sent");
    expect(dispatches?.reminder_48h_email?.backfilled_from).toBe("legacy_array");
  });
});
