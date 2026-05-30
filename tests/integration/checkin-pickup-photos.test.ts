/**
 * Integration tests for Wave 9 P0-2 sub-PR C — pickup-photo + custody-document
 * upload + delete + signed-URL serving:
 *
 *   POST   /api/admin/checkin/children/[personId]/authorized-pickups/[pickupId]/photo
 *   DELETE /api/admin/checkin/children/[personId]/authorized-pickups/[pickupId]/photo
 *   POST   /api/admin/checkin/blocked-pickups/[id]/photo
 *   DELETE /api/admin/checkin/blocked-pickups/[id]/photo
 *   POST   /api/admin/checkin/blocked-pickups/[id]/document
 *   DELETE /api/admin/checkin/blocked-pickups/[id]/document
 *   GET    /api/admin/checkin/photo?path=...
 *
 * Storage is mocked with an in-memory bucket — the existing test
 * infrastructure only runs the Firestore emulator, and Storage SDK
 * behavior is not the unit under test. We verify:
 *
 *   - Bytes land at the canonical storage path
 *   - File-size + content-type validation rejects bad uploads
 *   - 403 for non-admin roles
 *   - 403 for cross-tenant path queries against the signed-URL endpoint
 *   - Audit rows emit on every mutation
 *   - photo_url / document_url fields update with the storage path
 *   - Delete clears the field AND drops the Storage object
 */

import { beforeEach, describe, it, expect, vi } from "vitest";

// In-memory Storage stub. `bucket.file(path).save(buf, opts)` stores bytes
// keyed by path. `bucket.file(path).getSignedUrl(opts)` returns a
// deterministic fake URL. `bucket.file(path).delete()` removes the entry.
const storageMem = new Map<
  string,
  { buffer: Buffer; contentType: string; metadata: Record<string, unknown> }
>();

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
    adminStorage: {
      bucket: () => ({
        name: "demo-test.appspot.com",
        file: (path: string) => ({
          save: async (
            buffer: Buffer,
            opts: { metadata: { contentType: string; metadata: Record<string, unknown> } },
          ) => {
            storageMem.set(path, {
              buffer,
              contentType: opts.metadata.contentType,
              metadata: opts.metadata.metadata ?? {},
            });
          },
          getSignedUrl: async (opts: { expires: number }) => [
            `https://signed.example/${encodeURIComponent(path)}?expires=${opts.expires}`,
          ],
          delete: async () => {
            if (!storageMem.has(path)) {
              // Mirror Storage 404 behavior so the best-effort delete path
              // exercises its catch.
              throw Object.assign(new Error("not found"), { code: 404 });
            }
            storageMem.delete(path);
          },
        }),
      }),
    },
  };
});

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { POST as AUTH_POST } from "@/app/api/admin/checkin/children/[personId]/authorized-pickups/route";
import {
  POST as AUTH_PHOTO_POST,
  DELETE as AUTH_PHOTO_DELETE,
} from "@/app/api/admin/checkin/children/[personId]/authorized-pickups/[pickupId]/photo/route";
import { POST as BLOCKED_POST } from "@/app/api/admin/checkin/blocked-pickups/route";
import {
  POST as BLOCKED_PHOTO_POST,
  DELETE as BLOCKED_PHOTO_DELETE,
} from "@/app/api/admin/checkin/blocked-pickups/[id]/photo/route";
import {
  POST as BLOCKED_DOC_POST,
  DELETE as BLOCKED_DOC_DELETE,
} from "@/app/api/admin/checkin/blocked-pickups/[id]/document/route";
import { GET as PHOTO_GET } from "@/app/api/admin/checkin/photo/route";
import { resetFirestore, seedChurchAndMemberships, T } from "./_seed";

const CHILD_ID = "child-1";
const HOUSEHOLD_ID = "h-1";

function jsonReq(
  url: string,
  token: string,
  body: unknown,
  method: "POST" | "PATCH" | "DELETE" | "GET" = "POST",
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function multipartReq(
  url: string,
  token: string,
  fields: Record<string, string | File>,
): NextRequest {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.append(k, v as string);
  }
  return new NextRequest(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

function fakeImage(
  bytes: number,
  type = "image/jpeg",
  name = "photo.jpg",
): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

async function seedChildAndHousehold() {
  await adminDb
    .collection(`churches/${T.churchId}/people`)
    .doc(CHILD_ID)
    .set({
      id: CHILD_ID,
      church_id: T.churchId,
      household_ids: [HOUSEHOLD_ID],
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
  await adminDb
    .collection(`churches/${T.churchId}/households`)
    .doc(HOUSEHOLD_ID)
    .set({
      id: HOUSEHOLD_ID,
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

async function createAuthorizedPickup(): Promise<string> {
  const res = await AUTH_POST(
    jsonReq(
      `https://test/api/admin/checkin/children/${CHILD_ID}/authorized-pickups`,
      T.adminUid,
      { church_id: T.churchId, name: "Grandma Sue" },
    ),
    { params: Promise.resolve({ personId: CHILD_ID }) },
  );
  const { pickup } = await res.json();
  return pickup.id;
}

async function createBlockedPickup(): Promise<string> {
  const res = await BLOCKED_POST(
    jsonReq("https://test/api/admin/checkin/blocked-pickups", T.adminUid, {
      church_id: T.churchId,
      scope: "child",
      child_id: CHILD_ID,
      name: "Restricted Adult",
      reason: "court_order",
    }),
  );
  const { blocked } = await res.json();
  return blocked.id;
}

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
  storageMem.clear();
  await resetFirestore(adminDb);
  await seedChurchAndMemberships(adminDb);
  await seedChildAndHousehold();
});

describe("POST authorized-pickup photo", () => {
  it("uploads, writes the photo path, and emits audit", async () => {
    const pickupId = await createAuthorizedPickup();
    const res = await AUTH_PHOTO_POST(
      multipartReq(
        `https://test/api/admin/checkin/children/${CHILD_ID}/authorized-pickups/${pickupId}/photo`,
        T.adminUid,
        { church_id: T.churchId, file: fakeImage(1024) },
      ),
      { params: Promise.resolve({ personId: CHILD_ID, pickupId }) },
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    const expectedPath = `churches/${T.churchId}/checkin-photos/authorized/${pickupId}.jpg`;
    expect(json.photo_path).toBe(expectedPath);
    expect(storageMem.has(expectedPath)).toBe(true);

    // Person doc reflects the path.
    const childSnap = await adminDb
      .doc(`churches/${T.churchId}/people/${CHILD_ID}`)
      .get();
    const pickups = childSnap.data()?.child_profile?.authorized_pickups ?? [];
    expect(pickups[0].photo_url).toBe(expectedPath);

    expect(await auditCount("pickup.authorized_photo_added")).toBe(1);
  });

  it("rejects oversize file with 400", async () => {
    const pickupId = await createAuthorizedPickup();
    const res = await AUTH_PHOTO_POST(
      multipartReq(
        `https://test/api/admin/checkin/children/${CHILD_ID}/authorized-pickups/${pickupId}/photo`,
        T.adminUid,
        { church_id: T.churchId, file: fakeImage(6 * 1024 * 1024) },
      ),
      { params: Promise.resolve({ personId: CHILD_ID, pickupId }) },
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid content type with 400", async () => {
    const pickupId = await createAuthorizedPickup();
    const res = await AUTH_PHOTO_POST(
      multipartReq(
        `https://test/api/admin/checkin/children/${CHILD_ID}/authorized-pickups/${pickupId}/photo`,
        T.adminUid,
        {
          church_id: T.churchId,
          file: fakeImage(1024, "application/pdf", "doc.pdf"),
        },
      ),
      { params: Promise.resolve({ personId: CHILD_ID, pickupId }) },
    );
    expect(res.status).toBe(400);
  });

  it("rejects scheduler role with 403", async () => {
    const pickupId = await createAuthorizedPickup();
    const res = await AUTH_PHOTO_POST(
      multipartReq(
        `https://test/api/admin/checkin/children/${CHILD_ID}/authorized-pickups/${pickupId}/photo`,
        T.schedulerUid,
        { church_id: T.churchId, file: fakeImage(1024) },
      ),
      { params: Promise.resolve({ personId: CHILD_ID, pickupId }) },
    );
    expect(res.status).toBe(403);
  });

  it("DELETE removes the photo + clears the field + emits audit", async () => {
    const pickupId = await createAuthorizedPickup();
    await AUTH_PHOTO_POST(
      multipartReq(
        `https://test/api/admin/checkin/children/${CHILD_ID}/authorized-pickups/${pickupId}/photo`,
        T.adminUid,
        { church_id: T.churchId, file: fakeImage(1024) },
      ),
      { params: Promise.resolve({ personId: CHILD_ID, pickupId }) },
    );
    const expectedPath = `churches/${T.churchId}/checkin-photos/authorized/${pickupId}.jpg`;
    expect(storageMem.has(expectedPath)).toBe(true);

    const res = await AUTH_PHOTO_DELETE(
      jsonReq(
        `https://test/api/admin/checkin/children/${CHILD_ID}/authorized-pickups/${pickupId}/photo?church_id=${T.churchId}`,
        T.adminUid,
        undefined,
        "DELETE",
      ),
      { params: Promise.resolve({ personId: CHILD_ID, pickupId }) },
    );
    expect(res.status).toBe(204);
    expect(storageMem.has(expectedPath)).toBe(false);

    const childSnap = await adminDb
      .doc(`churches/${T.churchId}/people/${CHILD_ID}`)
      .get();
    const pickups = childSnap.data()?.child_profile?.authorized_pickups ?? [];
    expect(pickups[0].photo_url).toBe(null);

    expect(await auditCount("pickup.authorized_photo_removed")).toBe(1);
  });
});

describe("POST blocked-pickup photo + document", () => {
  it("uploads photo and persists path", async () => {
    const blockedId = await createBlockedPickup();
    const res = await BLOCKED_PHOTO_POST(
      multipartReq(
        `https://test/api/admin/checkin/blocked-pickups/${blockedId}/photo`,
        T.adminUid,
        { church_id: T.churchId, file: fakeImage(2048, "image/png", "p.png") },
      ),
      { params: Promise.resolve({ id: blockedId }) },
    );
    expect(res.status).toBe(201);
    const expectedPath = `churches/${T.churchId}/checkin-photos/blocked/${blockedId}.png`;
    expect(storageMem.has(expectedPath)).toBe(true);

    const docSnap = await adminDb
      .doc(`churches/${T.churchId}/checkin_blocked_pickups/${blockedId}`)
      .get();
    expect(docSnap.data()?.photo_url).toBe(expectedPath);
    expect(await auditCount("pickup.blocked_photo_added")).toBe(1);
  });

  it("uploads PDF as a custody document", async () => {
    const blockedId = await createBlockedPickup();
    const pdfFile = new File([new Uint8Array(4096)], "court-order.pdf", {
      type: "application/pdf",
    });
    const res = await BLOCKED_DOC_POST(
      multipartReq(
        `https://test/api/admin/checkin/blocked-pickups/${blockedId}/document`,
        T.adminUid,
        { church_id: T.churchId, file: pdfFile },
      ),
      { params: Promise.resolve({ id: blockedId }) },
    );
    expect(res.status).toBe(201);
    const expectedPath = `churches/${T.churchId}/checkin-photos/documents/${blockedId}.pdf`;
    expect(storageMem.has(expectedPath)).toBe(true);

    const docSnap = await adminDb
      .doc(`churches/${T.churchId}/checkin_blocked_pickups/${blockedId}`)
      .get();
    expect(docSnap.data()?.document_url).toBe(expectedPath);
    expect(await auditCount("pickup.blocked_document_added")).toBe(1);
  });

  it("rejects oversize document with 400", async () => {
    const blockedId = await createBlockedPickup();
    const bigPdf = new File(
      [new Uint8Array(11 * 1024 * 1024)],
      "big.pdf",
      { type: "application/pdf" },
    );
    const res = await BLOCKED_DOC_POST(
      multipartReq(
        `https://test/api/admin/checkin/blocked-pickups/${blockedId}/document`,
        T.adminUid,
        { church_id: T.churchId, file: bigPdf },
      ),
      { params: Promise.resolve({ id: blockedId }) },
    );
    expect(res.status).toBe(400);
  });

  it("DELETE blocked photo clears field + removes Storage object", async () => {
    const blockedId = await createBlockedPickup();
    await BLOCKED_PHOTO_POST(
      multipartReq(
        `https://test/api/admin/checkin/blocked-pickups/${blockedId}/photo`,
        T.adminUid,
        { church_id: T.churchId, file: fakeImage(1024) },
      ),
      { params: Promise.resolve({ id: blockedId }) },
    );
    const expectedPath = `churches/${T.churchId}/checkin-photos/blocked/${blockedId}.jpg`;
    expect(storageMem.has(expectedPath)).toBe(true);

    const res = await BLOCKED_PHOTO_DELETE(
      jsonReq(
        `https://test/api/admin/checkin/blocked-pickups/${blockedId}/photo?church_id=${T.churchId}`,
        T.adminUid,
        undefined,
        "DELETE",
      ),
      { params: Promise.resolve({ id: blockedId }) },
    );
    expect(res.status).toBe(204);
    expect(storageMem.has(expectedPath)).toBe(false);

    const docSnap = await adminDb
      .doc(`churches/${T.churchId}/checkin_blocked_pickups/${blockedId}`)
      .get();
    expect(docSnap.data()?.photo_url).toBe(null);
    expect(await auditCount("pickup.blocked_photo_removed")).toBe(1);
  });

  it("DELETE blocked document clears field + emits audit", async () => {
    const blockedId = await createBlockedPickup();
    const pdfFile = new File([new Uint8Array(2048)], "order.pdf", {
      type: "application/pdf",
    });
    await BLOCKED_DOC_POST(
      multipartReq(
        `https://test/api/admin/checkin/blocked-pickups/${blockedId}/document`,
        T.adminUid,
        { church_id: T.churchId, file: pdfFile },
      ),
      { params: Promise.resolve({ id: blockedId }) },
    );
    const expectedPath = `churches/${T.churchId}/checkin-photos/documents/${blockedId}.pdf`;
    expect(storageMem.has(expectedPath)).toBe(true);

    const res = await BLOCKED_DOC_DELETE(
      jsonReq(
        `https://test/api/admin/checkin/blocked-pickups/${blockedId}/document?church_id=${T.churchId}`,
        T.adminUid,
        undefined,
        "DELETE",
      ),
      { params: Promise.resolve({ id: blockedId }) },
    );
    expect(res.status).toBe(204);
    expect(storageMem.has(expectedPath)).toBe(false);
    expect(await auditCount("pickup.blocked_document_removed")).toBe(1);
  });
});

describe("GET /api/admin/checkin/photo (signed URL)", () => {
  it("returns a signed URL for a valid path in the caller's church", async () => {
    const pickupId = await createAuthorizedPickup();
    await AUTH_PHOTO_POST(
      multipartReq(
        `https://test/api/admin/checkin/children/${CHILD_ID}/authorized-pickups/${pickupId}/photo`,
        T.adminUid,
        { church_id: T.churchId, file: fakeImage(1024) },
      ),
      { params: Promise.resolve({ personId: CHILD_ID, pickupId }) },
    );
    const expectedPath = `churches/${T.churchId}/checkin-photos/authorized/${pickupId}.jpg`;

    const res = await PHOTO_GET(
      new NextRequest(
        `https://test/api/admin/checkin/photo?church_id=${T.churchId}&path=${encodeURIComponent(expectedPath)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${T.adminUid}` },
        },
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.signed_url).toMatch(/^https:\/\/signed\.example\//);
    expect(json.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rejects a path for a different church with 403", async () => {
    const res = await PHOTO_GET(
      new NextRequest(
        `https://test/api/admin/checkin/photo?church_id=${T.churchId}&path=${encodeURIComponent(
          "churches/OTHER/checkin-photos/blocked/abc.jpg",
        )}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${T.adminUid}` },
        },
      ),
    );
    expect(res.status).toBe(403);
  });

  it("rejects volunteer role with 403", async () => {
    const path = `churches/${T.churchId}/checkin-photos/authorized/anything.jpg`;
    const res = await PHOTO_GET(
      new NextRequest(
        `https://test/api/admin/checkin/photo?church_id=${T.churchId}&path=${encodeURIComponent(path)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${T.volunteerUid}` },
        },
      ),
    );
    expect(res.status).toBe(403);
  });
});
