/**
 * Integration smoke for POST /api/schedules/[id]/notify-leads (Wave 4.3).
 *
 * Locks in:
 *   - Auth: admin+ only; volunteer/scheduler/no-token fail
 *   - Tier gate: free org is 403
 *   - Status gate: published/approved schedule is 400 (only in_review/draft)
 *   - Happy path: one outbox entry per ministry with a lead_email,
 *     payload renders an approval-request subject/body
 *   - Skip path: ministries with no lead_email are counted in `skipped`
 *     and don't create outbox rows
 *   - Audit: emits schedule.notify_leads with counts in metadata
 *   - Scope: when schedule.ministry_ids is set, only those ministries
 *     get notified (others are silently filtered out)
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
import { POST } from "@/app/api/schedules/[id]/notify-leads/route";
import { resetFirestore, seedChurchAndMemberships, T } from "./_seed";

const SCHEDULE_ID = "s1";
const M1 = "m-worship";
const M2 = "m-kids";
const M3 = "m-tech";

function jsonRequest(body: object | undefined, token: string): NextRequest {
  return new NextRequest("https://test/api/schedules/s1/notify-leads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function seedSchedule(
  status: "draft" | "in_review" | "approved" | "published" = "in_review",
  ministryIds?: string[],
) {
  await adminDb
    .doc(`churches/${T.churchId}/schedules/${SCHEDULE_ID}`)
    .set({
      id: SCHEDULE_ID,
      church_id: T.churchId,
      date_range_start: "2026-06-01",
      date_range_end: "2026-06-30",
      status,
      workflow_mode: "centralized",
      created_by: T.ownerUid,
      created_at: new Date().toISOString(),
      published_at: null,
      ministry_approvals: {},
      ministry_ids: ministryIds ?? [],
      approval_workflow: {
        target_approval_date: "2026-05-30",
        started_at: new Date().toISOString(),
        approved_at: null,
        conflict_summary: null,
      },
    });
}

async function seedMinistries() {
  const base = {
    church_id: T.churchId,
    color: "#7185BC",
    description: "",
    created_at: new Date().toISOString(),
  };
  await adminDb.doc(`churches/${T.churchId}/ministries/${M1}`).set({
    ...base,
    id: M1,
    name: "Worship",
    lead_user_id: "uid-worship-lead",
    lead_email: "worship@example.com",
  });
  await adminDb.doc(`churches/${T.churchId}/ministries/${M2}`).set({
    ...base,
    id: M2,
    name: "Kids",
    lead_user_id: "uid-kids-lead",
    lead_email: "", // empty — should be skipped
  });
  await adminDb.doc(`churches/${T.churchId}/ministries/${M3}`).set({
    ...base,
    id: M3,
    name: "Tech",
    lead_user_id: "uid-tech-lead",
    lead_email: "tech@example.com",
  });
}

async function readOutboxEntriesForSchedule() {
  const snap = await adminDb
    .collection("notification_outbox")
    .where("source_ref", "==", `churches/${T.churchId}/schedules/${SCHEDULE_ID}`)
    .get();
  return snap.docs.map((d) => d.data());
}

async function waitForAudit(
  predicate: (data: Record<string, unknown>) => boolean,
  timeoutMs = 1500,
): Promise<Record<string, unknown>[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await adminDb.collection("audit_logs").get();
    const matched = snap.docs
      .map((d) => d.data())
      .filter((d) => predicate(d as Record<string, unknown>));
    if (matched.length >= 1) return matched;
    await new Promise((r) => setTimeout(r, 50));
  }
  return [];
}

beforeEach(async () => {
  await resetFirestore(adminDb);
  await seedChurchAndMemberships(adminDb, { tier: "growth" });
  await seedMinistries();
});

describe("POST /api/schedules/[id]/notify-leads", () => {
  it("401 without a bearer token", async () => {
    await seedSchedule();
    const req = new NextRequest("https://test/api/schedules/s1/notify-leads", {
      method: "POST",
      body: JSON.stringify({ church_id: T.churchId }),
    });
    const res = await POST(req, paramsFor(SCHEDULE_ID));
    expect(res.status).toBe(401);
  });

  it("403 when caller is a volunteer (not admin+)", async () => {
    await seedSchedule();
    const res = await POST(
      jsonRequest({ church_id: T.churchId }, T.volunteerUid),
      paramsFor(SCHEDULE_ID),
    );
    expect(res.status).toBe(403);
  });

  it("403 when org is on Free tier", async () => {
    await resetFirestore(adminDb);
    await seedChurchAndMemberships(adminDb, { tier: "free" });
    await seedMinistries();
    await seedSchedule();
    const res = await POST(
      jsonRequest({ church_id: T.churchId }, T.ownerUid),
      paramsFor(SCHEDULE_ID),
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.required_tier).toBe("growth");
  });

  it("404 when the schedule doesn't exist", async () => {
    const res = await POST(
      jsonRequest({ church_id: T.churchId }, T.ownerUid),
      paramsFor("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("400 when schedule is already published", async () => {
    await seedSchedule("published");
    const res = await POST(
      jsonRequest({ church_id: T.churchId }, T.ownerUid),
      paramsFor(SCHEDULE_ID),
    );
    expect(res.status).toBe(400);
  });

  it("happy path: enqueues one outbox entry per ministry with a lead_email", async () => {
    await seedSchedule("in_review");
    const res = await POST(
      jsonRequest({ church_id: T.churchId }, T.ownerUid),
      paramsFor(SCHEDULE_ID),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.sent).toBe(2); // worship + tech (kids has no email)
    expect(data.skipped).toBe(1);
    expect(data.ministries).toBe(3);

    const outbox = await readOutboxEntriesForSchedule();
    expect(outbox).toHaveLength(2);
    const tos = outbox.map((e) => (e.payload as Record<string, unknown>).to).sort();
    expect(tos).toEqual(["tech@example.com", "worship@example.com"]);
    for (const entry of outbox) {
      expect(entry.kind).toBe("email");
      expect(entry.origin).toBe("schedule.notify_leads");
      expect(entry.status).toBe("pending");
      const payload = entry.payload as Record<string, unknown>;
      expect((payload.subject as string).includes("Review needed")).toBe(true);
      expect((payload.html as string).includes("Schedule Review")).toBe(true);
    }

    const hits = await waitForAudit(
      (d) =>
        d.action === "schedule.notify_leads" &&
        d.target_id === SCHEDULE_ID &&
        d.actor === `user:${T.ownerUid}`,
    );
    expect(hits).toHaveLength(1);
    const metadata = (hits[0].metadata as Record<string, unknown>) ?? {};
    expect(metadata.ministries_in_scope).toBe(3);
    expect(metadata.emails_queued).toBe(2);
    expect(metadata.skipped).toBe(1);
    const reasons = metadata.skipped_reasons as { ministry_id: string; reason: string }[];
    expect(reasons).toHaveLength(1);
    expect(reasons[0].reason).toBe("no_lead_email");
  });

  it("respects schedule.ministry_ids scoping (only notifies scoped teams)", async () => {
    // Only worship is in the schedule's scope; kids and tech should be ignored.
    await seedSchedule("in_review", [M1]);
    const res = await POST(
      jsonRequest({ church_id: T.churchId }, T.ownerUid),
      paramsFor(SCHEDULE_ID),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sent).toBe(1);
    expect(data.ministries).toBe(1);

    const outbox = await readOutboxEntriesForSchedule();
    expect(outbox).toHaveLength(1);
    expect((outbox[0].payload as Record<string, unknown>).to).toBe(
      "worship@example.com",
    );
  });
});
