/**
 * Integration smoke for /api/memberships/[id] (Wave 4.1).
 *
 * This is the route that absorbed direct-Firestore-write callers in
 * src/lib/firebase/firestore.ts so that every membership lifecycle change
 * flows through one server endpoint and emits an audit_logs row. Locks in:
 *
 *   - Auth model (self OR admin/owner can mutate)
 *   - Self callers can't promote themselves or change someone else's row
 *   - Admin (non-owner) can't remove other admins or the owner
 *   - Owner can't self-remove (must transfer or wind the org down)
 *   - Each lifecycle change emits the correct AuditAction with metadata
 *     identifying who did what to whom
 *
 * Same vi.mock-then-import pattern as short-links.test.ts.
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
import { PATCH, DELETE } from "@/app/api/memberships/[id]/route";
import { resetFirestore, seedChurchAndMemberships, T } from "./_seed";

function jsonRequest(
  method: "PATCH" | "DELETE",
  body: object | undefined,
  token: string,
): NextRequest {
  return new NextRequest("https://test/api/memberships/x", {
    method,
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

/**
 * Wait until at least `min` audit rows match the predicate, or fail. The
 * audit() helper is fire-and-forget so we poll briefly instead of awaiting.
 */
async function waitForAudit(
  predicate: (data: Record<string, unknown>) => boolean,
  min = 1,
  timeoutMs = 1500,
): Promise<Record<string, unknown>[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await adminDb.collection("audit_logs").get();
    const matched = snap.docs
      .map((d) => d.data())
      .filter((d) => predicate(d as Record<string, unknown>));
    if (matched.length >= min) return matched;
    await new Promise((r) => setTimeout(r, 50));
  }
  return [];
}

beforeEach(async () => {
  await resetFirestore(adminDb);
  await seedChurchAndMemberships(adminDb);
});

describe("PATCH /api/memberships/[id]", () => {
  it("401 without a bearer token", async () => {
    const req = new NextRequest("https://test/api/memberships/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    const res = await PATCH(req, paramsFor(`${T.adminUid}_${T.churchId}`));
    expect(res.status).toBe(401);
  });

  it("404 when the membership doesn't exist", async () => {
    const res = await PATCH(
      jsonRequest("PATCH", { status: "active" }, T.ownerUid),
      paramsFor("nope-not-real"),
    );
    expect(res.status).toBe(404);
  });

  it("403 when caller is neither self nor admin of the target's church", async () => {
    // Volunteer trying to mutate the admin's membership.
    const res = await PATCH(
      jsonRequest("PATCH", { status: "inactive" }, T.volunteerUid),
      paramsFor(`${T.adminUid}_${T.churchId}`),
    );
    expect(res.status).toBe(403);
  });

  it("403 when self caller tries to change own role", async () => {
    const res = await PATCH(
      jsonRequest("PATCH", { role: "admin" }, T.volunteerUid),
      paramsFor(`${T.volunteerUid}_${T.churchId}`),
    );
    expect(res.status).toBe(403);
  });

  it("admin approving pending → active emits membership.approve", async () => {
    // Seed a pending invitee membership for a brand-new uid.
    const inviteeUid = "u-pending";
    const memId = `${inviteeUid}_${T.churchId}`;
    await adminDb.collection("memberships").doc(memId).set({
      user_id: inviteeUid,
      church_id: T.churchId,
      role: "volunteer",
      status: "pending_org_approval",
      ministry_scope: [],
      reminder_preferences: { channels: ["email"] },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await PATCH(
      jsonRequest("PATCH", { status: "active" }, T.ownerUid),
      paramsFor(memId),
    );
    expect(res.status).toBe(200);

    const hits = await waitForAudit(
      (d) =>
        d.action === "membership.approve" &&
        d.target_id === memId &&
        d.actor === `user:${T.ownerUid}`,
    );
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const metadata = (hits[0].metadata as Record<string, unknown>) ?? {};
    expect(metadata.from_status).toBe("pending_org_approval");
    expect(metadata.to_status).toBe("active");
    expect(metadata.self).toBe(false);
  });

  it("self accepting own invite emits membership.accept_invite", async () => {
    const memId = `${T.volunteerUid}_${T.churchId}`;
    // Reset the seeded volunteer to pending so we can accept.
    await adminDb
      .collection("memberships")
      .doc(memId)
      .update({ status: "pending_volunteer_approval" });

    const res = await PATCH(
      jsonRequest("PATCH", { status: "active" }, T.volunteerUid),
      paramsFor(memId),
    );
    expect(res.status).toBe(200);

    const hits = await waitForAudit(
      (d) =>
        d.action === "membership.accept_invite" &&
        d.target_id === memId &&
        d.actor === `user:${T.volunteerUid}`,
    );
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const metadata = (hits[0].metadata as Record<string, unknown>) ?? {};
    expect(metadata.self).toBe(true);
  });

  it("admin changing role emits membership.role_change", async () => {
    const memId = `${T.volunteerUid}_${T.churchId}`;
    const res = await PATCH(
      jsonRequest("PATCH", { role: "scheduler", ministry_scope: ["m1"] }, T.ownerUid),
      paramsFor(memId),
    );
    expect(res.status).toBe(200);

    const hits = await waitForAudit(
      (d) =>
        d.action === "membership.role_change" &&
        d.target_id === memId &&
        d.actor === `user:${T.ownerUid}`,
    );
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const metadata = (hits[0].metadata as Record<string, unknown>) ?? {};
    expect(metadata.from_role).toBe("volunteer");
    expect(metadata.to_role).toBe("scheduler");
    expect(metadata.ministry_scope).toEqual(["m1"]);
  });

  it("admin deactivating emits membership.deactivate", async () => {
    const memId = `${T.volunteerUid}_${T.churchId}`;
    const res = await PATCH(
      jsonRequest("PATCH", { status: "inactive" }, T.ownerUid),
      paramsFor(memId),
    );
    expect(res.status).toBe(200);

    const hits = await waitForAudit(
      (d) =>
        d.action === "membership.deactivate" &&
        d.target_id === memId &&
        d.actor === `user:${T.ownerUid}`,
    );
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it("reminder_preferences-only update does not emit an audit", async () => {
    const memId = `${T.volunteerUid}_${T.churchId}`;
    const res = await PATCH(
      jsonRequest(
        "PATCH",
        { reminder_preferences: { channels: ["sms"] } },
        T.volunteerUid,
      ),
      paramsFor(memId),
    );
    expect(res.status).toBe(200);

    // Should NOT have written an audit row for this kind of change.
    const snap = await adminDb.collection("audit_logs").get();
    const matchedReminder = snap.docs.filter(
      (d) => d.data().target_id === memId,
    );
    expect(matchedReminder).toHaveLength(0);
  });
});

describe("DELETE /api/memberships/[id]", () => {
  it("owner removing a volunteer emits membership.remove (self=false)", async () => {
    const memId = `${T.volunteerUid}_${T.churchId}`;
    const res = await DELETE(
      jsonRequest("DELETE", undefined, T.ownerUid),
      paramsFor(memId),
    );
    expect(res.status).toBe(200);

    const gone = await adminDb.doc(`memberships/${memId}`).get();
    expect(gone.exists).toBe(false);

    const hits = await waitForAudit(
      (d) =>
        d.action === "membership.remove" &&
        d.target_id === memId &&
        d.actor === `user:${T.ownerUid}`,
    );
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const metadata = (hits[0].metadata as Record<string, unknown>) ?? {};
    expect(metadata.self).toBe(false);
    expect(metadata.removed_user_id).toBe(T.volunteerUid);
  });

  it("self-leave by volunteer emits membership.remove (self=true)", async () => {
    const memId = `${T.volunteerUid}_${T.churchId}`;
    const res = await DELETE(
      jsonRequest("DELETE", undefined, T.volunteerUid),
      paramsFor(memId),
    );
    expect(res.status).toBe(200);

    const hits = await waitForAudit(
      (d) =>
        d.action === "membership.remove" &&
        d.target_id === memId &&
        d.actor === `user:${T.volunteerUid}`,
    );
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const metadata = (hits[0].metadata as Record<string, unknown>) ?? {};
    expect(metadata.self).toBe(true);
  });

  it("400 when owner tries to self-remove (would orphan church)", async () => {
    const memId = `${T.ownerUid}_${T.churchId}`;
    const res = await DELETE(
      jsonRequest("DELETE", undefined, T.ownerUid),
      paramsFor(memId),
    );
    expect(res.status).toBe(400);

    const still = await adminDb.doc(`memberships/${memId}`).get();
    expect(still.exists).toBe(true);
  });

  it("403 when admin (non-owner) tries to remove another admin", async () => {
    // Promote scheduler to admin so we can test admin-vs-admin removal.
    await adminDb
      .doc(`memberships/${T.schedulerUid}_${T.churchId}`)
      .update({ role: "admin" });

    const res = await DELETE(
      jsonRequest("DELETE", undefined, T.adminUid),
      paramsFor(`${T.schedulerUid}_${T.churchId}`),
    );
    expect(res.status).toBe(403);
  });

  it("403 when volunteer tries to remove the admin", async () => {
    const res = await DELETE(
      jsonRequest("DELETE", undefined, T.volunteerUid),
      paramsFor(`${T.adminUid}_${T.churchId}`),
    );
    expect(res.status).toBe(403);
  });
});
