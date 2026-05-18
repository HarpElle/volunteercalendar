/**
 * Integration smoke for /api/short-links. Hits the real route handlers
 * against the Firestore emulator. Locks in:
 *
 *   - PR #32: POST runs `where(church_id) + where(expires_at > now)`
 *     which requires the composite index. Without the index Firestore
 *     throws FAILED_PRECONDITION and our catch surfaces a 500 — exactly
 *     the regression Codex hit on production. This test exercises that
 *     query against the emulator (which IS index-strict in the same way
 *     prod is) so the same bug would fail CI.
 *
 *   - PR #31: PATCH `expire_now` back-dates expires_at and DELETE removes
 *     the doc. Both must remain admin-only.
 *
 * Other route-handler smoke tests should follow this same pattern (vi.mock
 * at the top → import handler → seed → call → assert).
 */

import { beforeEach, describe, it, expect, vi } from "vitest";

// Hoisted by vitest: replaces the admin SDK so adminDb points at the
// emulator and adminAuth.verifyIdToken treats the bearer token literally
// as the UID. Must be set up BEFORE any module that imports
// @/lib/firebase/admin loads.
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
import { POST, PATCH, DELETE, GET } from "@/app/api/short-links/route";
import {
  resetFirestore,
  seedChurchAndMemberships,
  T,
} from "./_seed";

function jsonRequest(
  method: "POST" | "PATCH" | "DELETE" | "GET",
  url: string,
  body?: object,
  token: string = T.adminUid,
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Reset + reseed in beforeEach so test files don't depend on the
// before/after ordering of sibling files (vitest may run them in
// parallel or interleave).
beforeEach(async () => {
  await resetFirestore(adminDb);
  await seedChurchAndMemberships(adminDb);
});

describe("POST /api/short-links", () => {
  it("rejects without a bearer token (401)", async () => {
    const req = new NextRequest("https://test/api/short-links", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects missing required fields (400)", async () => {
    const req = jsonRequest("POST", "https://test/api/short-links", {
      church_id: T.churchId,
      // missing slug + target_url + label
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects an invalid slug format (400)", async () => {
    const req = jsonRequest("POST", "https://test/api/short-links", {
      church_id: T.churchId,
      slug: "BadSlug!!",
      target_url: "/dashboard",
      label: "Test",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects a reserved slug (409)", async () => {
    const req = jsonRequest("POST", "https://test/api/short-links", {
      church_id: T.churchId,
      slug: "dashboard",
      target_url: "/dashboard",
      label: "Test",
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("rejects non-admin members (403)", async () => {
    const req = jsonRequest(
      "POST",
      "https://test/api/short-links",
      {
        church_id: T.churchId,
        slug: "vol-test",
        target_url: "/dashboard",
        label: "Test",
      },
      T.volunteerUid,
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  // PR #32 regression. Exercises the tier-limit query
  //   where(church_id) + where(expires_at > now)
  // against the emulator. If the composite index disappears from
  // firestore.indexes.json this test starts failing with a 500 + the
  // "needs a composite index" detail message.
  it("creates a short link with valid params (the PR #32 happy path)", async () => {
    const req = jsonRequest("POST", "https://test/api/short-links", {
      church_id: T.churchId,
      slug: "phase6-test",
      target_url: "/dashboard",
      label: "Phase 6 expired-link test",
      expires_in_days: 1,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.slug).toBe("phase6-test");
    expect(typeof data.id).toBe("string");
    expect(typeof data.expires_at).toBe("string");

    // Doc actually landed
    const doc = await adminDb.collection("short_links").doc(data.id).get();
    expect(doc.exists).toBe(true);
    expect(doc.data()?.church_id).toBe(T.churchId);
    expect(doc.data()?.target_kind).toBe("relative");
  });

  it("rejects a duplicate active slug (409)", async () => {
    const req1 = jsonRequest("POST", "https://test/api/short-links", {
      church_id: T.churchId,
      slug: "dup",
      target_url: "/dashboard",
      label: "First",
    });
    expect((await POST(req1)).status).toBe(200);

    const req2 = jsonRequest("POST", "https://test/api/short-links", {
      church_id: T.churchId,
      slug: "dup",
      target_url: "/dashboard",
      label: "Second",
    });
    expect((await POST(req2)).status).toBe(409);
  });
});

describe("PATCH /api/short-links (action: expire_now)", () => {
  it("back-dates expires_at on a valid link", async () => {
    const createRes = await POST(
      jsonRequest("POST", "https://test/api/short-links", {
        church_id: T.churchId,
        slug: "patch-target",
        target_url: "/dashboard",
        label: "Patch test",
        expires_in_days: 30,
      }),
    );
    const { id } = await createRes.json();

    const patchRes = await PATCH(
      jsonRequest("PATCH", "https://test/api/short-links", {
        church_id: T.churchId,
        link_id: id,
        action: "expire_now",
      }),
    );
    expect(patchRes.status).toBe(200);
    const data = await patchRes.json();
    expect(new Date(data.expires_at).getTime()).toBeLessThan(Date.now());

    const doc = await adminDb.collection("short_links").doc(id).get();
    expect(new Date(doc.data()!.expires_at as string).getTime()).toBeLessThan(Date.now());
  });

  it("rejects unsupported action (400)", async () => {
    const res = await PATCH(
      jsonRequest("PATCH", "https://test/api/short-links", {
        church_id: T.churchId,
        link_id: "anything",
        action: "delete_silently",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects non-admin (403)", async () => {
    const res = await PATCH(
      jsonRequest(
        "PATCH",
        "https://test/api/short-links",
        { church_id: T.churchId, link_id: "anything", action: "expire_now" },
        T.volunteerUid,
      ),
    );
    expect(res.status).toBe(403);
  });

  it("403 when caller has no membership in the requested church (cross-tenant guard)", async () => {
    // The membership check fires before the link-exists check, so any
    // attempt to mutate someone else's church's link is denied at the
    // role gate rather than the 404 branch. Cross-tenant defense in
    // depth — Codex Phase 6.
    const createRes = await POST(
      jsonRequest("POST", "https://test/api/short-links", {
        church_id: T.churchId,
        slug: "cross-church-test",
        target_url: "/dashboard",
        label: "Cross-church test",
      }),
    );
    const { id } = await createRes.json();
    const res = await PATCH(
      jsonRequest("PATCH", "https://test/api/short-links", {
        church_id: "other-church",
        link_id: id,
        action: "expire_now",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("404 when the link does not exist", async () => {
    const res = await PATCH(
      jsonRequest("PATCH", "https://test/api/short-links", {
        church_id: T.churchId,
        link_id: "does-not-exist",
        action: "expire_now",
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/short-links", () => {
  it("removes the link", async () => {
    const createRes = await POST(
      jsonRequest("POST", "https://test/api/short-links", {
        church_id: T.churchId,
        slug: "del-target",
        target_url: "/dashboard",
        label: "Delete test",
      }),
    );
    const { id } = await createRes.json();

    const delRes = await DELETE(
      jsonRequest("DELETE", "https://test/api/short-links", {
        church_id: T.churchId,
        link_id: id,
      }),
    );
    expect(delRes.status).toBe(200);
    const doc = await adminDb.collection("short_links").doc(id).get();
    expect(doc.exists).toBe(false);
  });
});

describe("GET /api/short-links", () => {
  it("returns the church's links ordered by created_at desc", async () => {
    // Two links; second created after first
    await POST(
      jsonRequest("POST", "https://test/api/short-links", {
        church_id: T.churchId,
        slug: "first",
        target_url: "/dashboard",
        label: "First",
      }),
    );
    await new Promise((r) => setTimeout(r, 5)); // ensure created_at differs
    await POST(
      jsonRequest("POST", "https://test/api/short-links", {
        church_id: T.churchId,
        slug: "second",
        target_url: "/dashboard",
        label: "Second",
      }),
    );

    const res = await GET(
      new NextRequest(`https://test/api/short-links?church_id=${T.churchId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${T.adminUid}` },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.links).toHaveLength(2);
    expect(data.links[0].slug).toBe("second"); // newest first
    expect(data.links[1].slug).toBe("first");
  });
});
