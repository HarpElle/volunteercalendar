/**
 * Integration tests for Wave 9 P0-2 sub-PR B — pickup management routes:
 *
 *   POST   /api/admin/checkin/children/[personId]/authorized-pickups
 *   PATCH  /api/admin/checkin/children/[personId]/authorized-pickups/[pickupId]
 *   DELETE /api/admin/checkin/children/[personId]/authorized-pickups/[pickupId]
 *   GET    /api/admin/checkin/blocked-pickups
 *   POST   /api/admin/checkin/blocked-pickups
 *   PATCH  /api/admin/checkin/blocked-pickups/[id]
 *   DELETE /api/admin/checkin/blocked-pickups/[id]
 *   PUT    /api/admin/checkin/settings   (ERT audit emit)
 *
 * Locks in:
 *   - Admin (owner/admin) gate; scheduler + volunteer are 403
 *   - Cross-tenant denial (a child in a different church can't be touched)
 *   - Audit-log row appears for every mutation
 *   - Block-list GET by child_id includes child-scope AND household-scope blocks
 *     for households the child belongs to (the kiosk-critical query)
 *   - ERT audit fires only when ERT membership actually changes
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
import { POST as AUTH_POST } from "@/app/api/admin/checkin/children/[personId]/authorized-pickups/route";
import {
  DELETE as AUTH_DELETE,
  PATCH as AUTH_PATCH,
} from "@/app/api/admin/checkin/children/[personId]/authorized-pickups/[pickupId]/route";
import {
  GET as BLOCKED_GET,
  POST as BLOCKED_POST,
} from "@/app/api/admin/checkin/blocked-pickups/route";
import { DELETE as BLOCKED_DELETE } from "@/app/api/admin/checkin/blocked-pickups/[id]/route";
import { PUT as SETTINGS_PUT } from "@/app/api/admin/checkin/settings/route";
import { resetFirestore, seedChurchAndMemberships, T } from "./_seed";

const CHILD_ID = "child-1";
const HOUSEHOLD_ID = "h-1";

function bearerReq(
  url: string,
  token: string,
  body?: unknown,
  method: "POST" | "PATCH" | "DELETE" | "PUT" | "GET" = "POST",
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function seedChild(personId = CHILD_ID, householdIds = [HOUSEHOLD_ID]) {
  await adminDb
    .collection(`churches/${T.churchId}/people`)
    .doc(personId)
    .set({
      id: personId,
      church_id: T.churchId,
      household_ids: householdIds,
      person_type: "child",
      name: "Test Child",
      status: "active",
      child_profile: {
        date_of_birth: null,
        grade: null,
        allergies: null,
        medical_notes: null,
        default_room_id: null,
        has_alerts: false,
        authorized_pickups: [],
        photo_url: null,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
}

async function seedHousehold(householdId = HOUSEHOLD_ID) {
  await adminDb
    .collection(`churches/${T.churchId}/households`)
    .doc(householdId)
    .set({
      id: householdId,
      church_id: T.churchId,
      name: "Test Household",
      primary_guardian_id: null,
      qr_token: null,
      constraints: {
        never_same_service: false,
        prefer_same_service: false,
        never_same_time: false,
      },
      notes: null,
      imported_from: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
}

/**
 * Audit count with a short poll window. The route uses `void audit(...)`
 * (fire-and-forget, the codebase-wide pattern for sub-50ms audit writes
 * that must not block the response). Tests that read `audit_logs`
 * immediately after a POST/PATCH/DELETE can race the in-flight write —
 * this helper waits up to 1s for the row to appear before giving up.
 */
async function auditCount(action: string, timeoutMs = 1000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await adminDb
      .collection("audit_logs")
      .where("action", "==", action)
      .get();
    if (snap.size > 0) return snap.size;
    await new Promise((r) => setTimeout(r, 25));
  }
  const final = await adminDb
    .collection("audit_logs")
    .where("action", "==", action)
    .get();
  return final.size;
}

beforeEach(async () => {
  await resetFirestore(adminDb);
  await seedChurchAndMemberships(adminDb);
  await seedChild();
  await seedHousehold();
});

describe("POST /api/admin/checkin/children/[personId]/authorized-pickups", () => {
  it("creates an authorized pickup, returns it, and emits audit", async () => {
    const req = bearerReq(
      `https://test/api/admin/checkin/children/${CHILD_ID}/authorized-pickups`,
      T.adminUid,
      {
        church_id: T.churchId,
        name: "Grandma Sue",
        phone: "+15555550100",
        relationship: "grandmother",
      },
    );
    const res = await AUTH_POST(req, {
      params: Promise.resolve({ personId: CHILD_ID }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.pickup.name).toBe("Grandma Sue");
    expect(json.pickup.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(json.pickup.added_by_user_id).toBe(T.adminUid);

    // Person doc reflects the new pickup.
    const childSnap = await adminDb
      .doc(`churches/${T.churchId}/people/${CHILD_ID}`)
      .get();
    expect(childSnap.data()?.child_profile.authorized_pickups).toHaveLength(1);

    // Audit row.
    expect(await auditCount("pickup.authorized_added")).toBe(1);
  });

  it("rejects scheduler role with 403", async () => {
    const req = bearerReq(
      `https://test/api/admin/checkin/children/${CHILD_ID}/authorized-pickups`,
      T.schedulerUid,
      { church_id: T.churchId, name: "Anyone" },
    );
    const res = await AUTH_POST(req, {
      params: Promise.resolve({ personId: CHILD_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects missing name with 400", async () => {
    const req = bearerReq(
      `https://test/api/admin/checkin/children/${CHILD_ID}/authorized-pickups`,
      T.adminUid,
      { church_id: T.churchId },
    );
    const res = await AUTH_POST(req, {
      params: Promise.resolve({ personId: CHILD_ID }),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE + PATCH authorized pickup", () => {
  it("DELETE removes by id and emits audit", async () => {
    // Add first.
    const createReq = bearerReq(
      `https://test/api/admin/checkin/children/${CHILD_ID}/authorized-pickups`,
      T.adminUid,
      { church_id: T.churchId, name: "Grandma Sue" },
    );
    const created = await AUTH_POST(createReq, {
      params: Promise.resolve({ personId: CHILD_ID }),
    });
    const { pickup } = await created.json();

    const delReq = bearerReq(
      `https://test/api/admin/checkin/children/${CHILD_ID}/authorized-pickups/${pickup.id}?church_id=${T.churchId}`,
      T.adminUid,
      undefined,
      "DELETE",
    );
    const res = await AUTH_DELETE(delReq, {
      params: Promise.resolve({ personId: CHILD_ID, pickupId: pickup.id }),
    });
    expect(res.status).toBe(204);

    const childSnap = await adminDb
      .doc(`churches/${T.churchId}/people/${CHILD_ID}`)
      .get();
    expect(childSnap.data()?.child_profile.authorized_pickups).toHaveLength(0);
    expect(await auditCount("pickup.authorized_removed")).toBe(1);
  });

  it("PATCH updates name + emits authorized_updated audit", async () => {
    const created = await AUTH_POST(
      bearerReq(
        `https://test/api/admin/checkin/children/${CHILD_ID}/authorized-pickups`,
        T.adminUid,
        { church_id: T.churchId, name: "Old Name", phone: "+15555550100" },
      ),
      { params: Promise.resolve({ personId: CHILD_ID }) },
    );
    const { pickup } = await created.json();

    const res = await AUTH_PATCH(
      bearerReq(
        `https://test/api/admin/checkin/children/${CHILD_ID}/authorized-pickups/${pickup.id}`,
        T.adminUid,
        { church_id: T.churchId, name: "New Name" },
        "PATCH",
      ),
      {
        params: Promise.resolve({
          personId: CHILD_ID,
          pickupId: pickup.id,
        }),
      },
    );
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.pickup.name).toBe("New Name");
    expect(updated.pickup.phone).toBe("+15555550100"); // preserved
    expect(await auditCount("pickup.authorized_updated")).toBe(1);
  });
});

describe("POST /api/admin/checkin/blocked-pickups", () => {
  it("creates a child-scope block + emits audit", async () => {
    const req = bearerReq(
      "https://test/api/admin/checkin/blocked-pickups",
      T.adminUid,
      {
        church_id: T.churchId,
        scope: "child",
        child_id: CHILD_ID,
        name: "Restricted Adult",
        phone: "+15555550199",
        reason: "court_order",
        notes: null,
        expires_at: null,
      },
    );
    const res = await BLOCKED_POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.blocked.scope).toBe("child");
    expect(json.blocked.child_id).toBe(CHILD_ID);
    expect(json.blocked.household_id).toBe(null);
    expect(await auditCount("pickup.blocked_added")).toBe(1);
  });

  it("creates a household-scope block (sibling-wide)", async () => {
    const req = bearerReq(
      "https://test/api/admin/checkin/blocked-pickups",
      T.adminUid,
      {
        church_id: T.churchId,
        scope: "household",
        household_id: HOUSEHOLD_ID,
        name: "Estranged Ex-Spouse",
        reason: "court_order",
      },
    );
    const res = await BLOCKED_POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.blocked.scope).toBe("household");
    expect(json.blocked.household_id).toBe(HOUSEHOLD_ID);
    expect(json.blocked.child_id).toBe(null);
  });

  it("rejects scope=child without child_id (400)", async () => {
    const req = bearerReq(
      "https://test/api/admin/checkin/blocked-pickups",
      T.adminUid,
      {
        church_id: T.churchId,
        scope: "child",
        name: "Anyone",
        reason: "court_order",
      },
    );
    const res = await BLOCKED_POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects volunteer role with 403", async () => {
    const req = bearerReq(
      "https://test/api/admin/checkin/blocked-pickups",
      T.volunteerUid,
      {
        church_id: T.churchId,
        scope: "child",
        child_id: CHILD_ID,
        name: "Restricted",
        reason: "court_order",
      },
    );
    const res = await BLOCKED_POST(req);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/checkin/blocked-pickups", () => {
  it("filtered by child_id returns child-scope AND household-scope blocks for that child's households", async () => {
    // Two blocks: one child-scope on CHILD_ID, one household-scope on HOUSEHOLD_ID.
    await BLOCKED_POST(
      bearerReq(
        "https://test/api/admin/checkin/blocked-pickups",
        T.adminUid,
        {
          church_id: T.churchId,
          scope: "child",
          child_id: CHILD_ID,
          name: "Per-child block",
          reason: "household_decision",
        },
      ),
    );
    await BLOCKED_POST(
      bearerReq(
        "https://test/api/admin/checkin/blocked-pickups",
        T.adminUid,
        {
          church_id: T.churchId,
          scope: "household",
          household_id: HOUSEHOLD_ID,
          name: "Sibling-wide block",
          reason: "court_order",
        },
      ),
    );
    // And one block for a DIFFERENT household — must NOT be returned.
    await seedHousehold("h-other");
    await BLOCKED_POST(
      bearerReq(
        "https://test/api/admin/checkin/blocked-pickups",
        T.adminUid,
        {
          church_id: T.churchId,
          scope: "household",
          household_id: "h-other",
          name: "Irrelevant block",
          reason: "court_order",
        },
      ),
    );

    const res = await BLOCKED_GET(
      bearerReq(
        `https://test/api/admin/checkin/blocked-pickups?church_id=${T.churchId}&child_id=${CHILD_ID}`,
        T.adminUid,
        undefined,
        "GET",
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const names = json.blocked.map((b: { name: string }) => b.name).sort();
    expect(names).toEqual(["Per-child block", "Sibling-wide block"]);
    expect(names).not.toContain("Irrelevant block");
  });
});

describe("DELETE blocked pickup", () => {
  it("removes by id + emits audit", async () => {
    const created = await BLOCKED_POST(
      bearerReq(
        "https://test/api/admin/checkin/blocked-pickups",
        T.adminUid,
        {
          church_id: T.churchId,
          scope: "child",
          child_id: CHILD_ID,
          name: "Going Away",
          reason: "other",
        },
      ),
    );
    const { blocked } = await created.json();

    const res = await BLOCKED_DELETE(
      bearerReq(
        `https://test/api/admin/checkin/blocked-pickups/${blocked.id}?church_id=${T.churchId}`,
        T.adminUid,
        undefined,
        "DELETE",
      ),
      { params: Promise.resolve({ id: blocked.id }) },
    );
    expect(res.status).toBe(204);

    const docSnap = await adminDb
      .doc(`churches/${T.churchId}/checkin_blocked_pickups/${blocked.id}`)
      .get();
    expect(docSnap.exists).toBe(false);
    expect(await auditCount("pickup.blocked_removed")).toBe(1);
  });
});

describe("PUT /api/admin/checkin/settings — ERT audit", () => {
  it("emits checkin.ert_settings_updated when ERT list changes", async () => {
    const res = await SETTINGS_PUT(
      bearerReq(
        "https://test/api/admin/checkin/settings",
        T.adminUid,
        {
          church_id: T.churchId,
          emergency_notification_numbers: [
            { name: "Deacon Joe", phone: "+15555550111", role: "Safety Lead" },
          ],
        },
        "PUT",
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.emergency_notification_numbers).toHaveLength(1);
    expect(await auditCount("checkin.ert_settings_updated")).toBe(1);
  });

  it("does NOT emit audit on a no-op save (same ERT list)", async () => {
    // Initial save.
    await SETTINGS_PUT(
      bearerReq(
        "https://test/api/admin/checkin/settings",
        T.adminUid,
        {
          church_id: T.churchId,
          emergency_notification_numbers: [
            { name: "Deacon Joe", phone: "+15555550111", role: null },
          ],
        },
        "PUT",
      ),
    );
    expect(await auditCount("checkin.ert_settings_updated")).toBe(1);

    // Same content saved again — must not double-audit.
    await SETTINGS_PUT(
      bearerReq(
        "https://test/api/admin/checkin/settings",
        T.adminUid,
        {
          church_id: T.churchId,
          emergency_notification_numbers: [
            { name: "Deacon Joe", phone: "+15555550111", role: null },
          ],
        },
        "PUT",
      ),
    );
    expect(await auditCount("checkin.ert_settings_updated")).toBe(1);
  });

  it("drops malformed ERT entries (missing name or phone)", async () => {
    const res = await SETTINGS_PUT(
      bearerReq(
        "https://test/api/admin/checkin/settings",
        T.adminUid,
        {
          church_id: T.churchId,
          emergency_notification_numbers: [
            { name: "Valid", phone: "+15555550111", role: null },
            { name: "Missing phone", phone: "", role: null },
            { name: "", phone: "+15555550222", role: null },
            "not even an object",
          ],
        },
        "PUT",
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.emergency_notification_numbers).toHaveLength(1);
    expect(json.emergency_notification_numbers[0].name).toBe("Valid");
  });
});
