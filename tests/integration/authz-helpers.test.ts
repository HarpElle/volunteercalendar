/**
 * Integration tests for Wave 3.1 authz library helpers.
 *
 * Covers requireUser, requireMembership, requirePlatformAdmin. The Stripe
 * helper (requireStripeWebhook) is covered end-to-end by the existing
 * /api/billing/webhook tests + harder to mock without a real Stripe
 * instance, so skipped here.
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
      verifyIdToken: vi.fn(async (token: string) => {
        if (token === "INVALID") throw new Error("token invalid");
        return { uid: token, email: `${token}@example.com` };
      }),
    },
    adminStorage: {},
  };
});

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
  requireUser,
  requireMembership,
  requirePlatformAdmin,
} from "@/lib/server/authz";
import { resetFirestore, seedChurchAndMemberships, T } from "./_seed";

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://test/api/whatever", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("Wave 3.1 — requireUser", () => {
  it("returns 401 NextResponse when Authorization header is missing", async () => {
    const result = await requireUser(makeReq());
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("returns 401 NextResponse when Authorization is not a Bearer token", async () => {
    const result = await requireUser(makeReq({ Authorization: "Basic xyz" }));
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("returns 401 NextResponse when token verification throws", async () => {
    const result = await requireUser(
      makeReq({ Authorization: "Bearer INVALID" }),
    );
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe("Invalid token");
  });

  it("returns AuthedUser on success", async () => {
    const result = await requireUser(
      makeReq({ Authorization: `Bearer ${T.adminUid}` }),
    );
    expect(result).not.toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) return; // type narrow
    expect(result.uid).toBe(T.adminUid);
    expect(result.email).toBe(`${T.adminUid}@example.com`);
    expect(result.claims.uid).toBe(T.adminUid);
  });
});

describe("Wave 3.1 — requireMembership", () => {
  beforeEach(async () => {
    await resetFirestore(adminDb);
    await seedChurchAndMemberships(adminDb);
  });

  it("returns 401 on missing auth (delegates to requireUser)", async () => {
    const result = await requireMembership(makeReq(), T.churchId);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("returns 403 when the user has no membership in the church", async () => {
    const result = await requireMembership(
      makeReq({ Authorization: "Bearer nonmember-uid" }),
      T.churchId,
    );
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(403);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe("Not a member");
  });

  it("returns 403 when membership is inactive", async () => {
    await adminDb
      .doc(`memberships/${T.volunteerUid}_${T.churchId}`)
      .update({ status: "pending_org_approval" });
    const result = await requireMembership(
      makeReq({ Authorization: `Bearer ${T.volunteerUid}` }),
      T.churchId,
    );
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(403);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe("Membership is not active");
  });

  it("returns 403 when role is below minRole", async () => {
    const result = await requireMembership(
      makeReq({ Authorization: `Bearer ${T.volunteerUid}` }),
      T.churchId,
      "admin", // require admin+ but volunteer is below
    );
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(403);
    const body = await (result as NextResponse).json();
    expect(body.error).toContain("admin or higher required");
  });

  it("returns AuthedMembership when role meets minRole exactly", async () => {
    const result = await requireMembership(
      makeReq({ Authorization: `Bearer ${T.adminUid}` }),
      T.churchId,
      "admin",
    );
    expect(result).not.toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) return;
    expect(result.uid).toBe(T.adminUid);
    expect(result.role).toBe("admin");
    expect(result.status).toBe("active");
    expect(result.church_id).toBe(T.churchId);
    expect(result.membership_id).toBe(`${T.adminUid}_${T.churchId}`);
    expect(Array.isArray(result.ministry_scope)).toBe(true);
  });

  it("returns AuthedMembership when role exceeds minRole (owner with minRole=scheduler)", async () => {
    const result = await requireMembership(
      makeReq({ Authorization: `Bearer ${T.ownerUid}` }),
      T.churchId,
      "scheduler",
    );
    expect(result).not.toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) return;
    expect(result.role).toBe("owner");
  });

  it("default minRole=volunteer admits volunteer", async () => {
    const result = await requireMembership(
      makeReq({ Authorization: `Bearer ${T.volunteerUid}` }),
      T.churchId,
    );
    expect(result).not.toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) return;
    expect(result.role).toBe("volunteer");
  });
});

describe("Wave 3.1 — requirePlatformAdmin", () => {
  beforeAll(() => {
    process.env.PLATFORM_ADMIN_UIDS = "platform-admin-uid,another-platform-admin";
  });

  it("returns 401 on missing auth", async () => {
    const result = await requirePlatformAdmin(makeReq());
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("returns 403 when authenticated user is not in PLATFORM_ADMIN_UIDS", async () => {
    const result = await requirePlatformAdmin(
      makeReq({ Authorization: `Bearer ${T.volunteerUid}` }),
    );
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(403);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns AuthedPlatformAdmin when uid matches the whitelist", async () => {
    const result = await requirePlatformAdmin(
      makeReq({ Authorization: "Bearer platform-admin-uid" }),
    );
    expect(result).not.toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) return;
    expect(result.uid).toBe("platform-admin-uid");
    expect(result.is_platform_admin).toBe(true);
  });
});
