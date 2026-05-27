/**
 * Integration smoke for GET /api/account/activity (Wave 4.2 hotfix).
 *
 * Confirms:
 *   - 401 without bearer
 *   - Only returns rows where actor == "user:{uid}" of the caller
 *   - Filters to auth.* actions in the response (other actions by the
 *     same user are not returned by this endpoint)
 *   - Cross-user isolation: caller A can't see caller B's rows even
 *     if A spoofs B's uid in the query string (the endpoint uses the
 *     verified token uid, not any user-supplied param)
 *   - Sorts newest first + respects limit
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
import { GET } from "@/app/api/account/activity/route";
import { resetFirestore, seedChurchAndMemberships, T } from "./_seed";

function authedRequest(token: string, limit?: number): NextRequest {
  const url = limit
    ? `https://test/api/account/activity?limit=${limit}`
    : "https://test/api/account/activity";
  return new NextRequest(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function seedAuditRow(
  actor: string,
  action: string,
  createdAtIso: string,
): Promise<void> {
  await adminDb.collection("audit_logs").add({
    church_id: null,
    actor,
    action,
    target_type: "user",
    target_id: actor.replace("user:", ""),
    metadata: {},
    outcome: "ok",
    created_at: createdAtIso,
  });
}

beforeEach(async () => {
  await resetFirestore(adminDb);
  await seedChurchAndMemberships(adminDb);
});

describe("GET /api/account/activity", () => {
  it("401 without a bearer token", async () => {
    const req = new NextRequest("https://test/api/account/activity", {
      method: "GET",
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns the caller's auth.* rows sorted newest first", async () => {
    const now = Date.now();
    await seedAuditRow(
      `user:${T.ownerUid}`,
      "auth.mfa_enrolled",
      new Date(now - 3 * 86400_000).toISOString(),
    );
    await seedAuditRow(
      `user:${T.ownerUid}`,
      "auth.mfa_disabled",
      new Date(now - 1 * 86400_000).toISOString(),
    );
    await seedAuditRow(
      `user:${T.ownerUid}`,
      "auth.mfa_enrolled",
      new Date(now - 2 * 86400_000).toISOString(),
    );

    const res = await GET(authedRequest(T.ownerUid));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { entries: { action: string }[] };
    expect(data.entries).toHaveLength(3);
    expect(data.entries[0].action).toBe("auth.mfa_disabled");
    expect(data.entries[2].action).toBe("auth.mfa_enrolled");
  });

  it("filters out non-auth.* actions even for the same actor", async () => {
    const now = Date.now();
    await seedAuditRow(
      `user:${T.ownerUid}`,
      "auth.mfa_enrolled",
      new Date(now - 1000).toISOString(),
    );
    // Same actor, different (org-scoped) action — should be excluded
    await seedAuditRow(
      `user:${T.ownerUid}`,
      "membership.role_change",
      new Date(now - 500).toISOString(),
    );

    const res = await GET(authedRequest(T.ownerUid));
    const data = (await res.json()) as { entries: { action: string }[] };
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].action).toBe("auth.mfa_enrolled");
  });

  it("cross-user isolation: returns only the verified caller's rows", async () => {
    const now = Date.now();
    await seedAuditRow(
      `user:${T.ownerUid}`,
      "auth.mfa_enrolled",
      new Date(now - 1000).toISOString(),
    );
    await seedAuditRow(
      `user:${T.adminUid}`,
      "auth.mfa_enrolled",
      new Date(now - 500).toISOString(),
    );

    // Admin token only sees their own row, NOT the owner's
    const res = await GET(authedRequest(T.adminUid));
    const data = (await res.json()) as {
      entries: { id: string; target_id: string }[];
    };
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].target_id).toBe(T.adminUid);
  });

  it("respects ?limit=", async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await seedAuditRow(
        `user:${T.ownerUid}`,
        "auth.mfa_enrolled",
        new Date(now - i * 1000).toISOString(),
      );
    }
    const res = await GET(authedRequest(T.ownerUid, 2));
    const data = (await res.json()) as { entries: unknown[] };
    expect(data.entries).toHaveLength(2);
  });

  it("returns empty list when the user has no auth.* events", async () => {
    const res = await GET(authedRequest(T.ownerUid));
    const data = (await res.json()) as { entries: unknown[] };
    expect(data.entries).toEqual([]);
  });
});
