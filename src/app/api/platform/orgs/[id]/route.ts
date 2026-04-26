import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isPlatformAdmin } from "@/lib/utils/platform-admin";
import { buildOrgSnapshot } from "@/lib/server/org-snapshot";
import type { OrgSnapshot } from "@/lib/types/platform";

async function requirePlatformAdmin(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  if (!isPlatformAdmin(decoded.uid)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return decoded;
}

/**
 * GET /api/platform/orgs/[id]
 *
 * Returns the full per-org snapshot. Reads the cached snapshot from
 * `platform/orgs/{id}` if recent (<1h), else recomputes.
 *
 * Always recomputes the owner's `last_sign_in_at` from Firebase Auth so
 * the value is fresh on the detail page (1 extra round-trip).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing org id" }, { status: 400 });
  }

  try {
    const cachedDoc = await adminDb.doc(`platform_orgs/${id}`).get();
    const cached = cachedDoc.exists ? (cachedDoc.data() as OrgSnapshot) : null;

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const stale =
      !cached || new Date(cached.computed_at).getTime() < oneHourAgo;

    if (stale) {
      const fresh = await buildOrgSnapshot(id, true);
      if (!fresh) {
        return NextResponse.json({ error: "Org not found" }, { status: 404 });
      }
      await adminDb.doc(`platform_orgs/${id}`).set(fresh);
      return NextResponse.json({ snapshot: fresh });
    }

    // Cached, but always overlay a fresh owner.last_sign_in_at lookup.
    if (cached!.owner.uid) {
      try {
        const authUser = await adminAuth.getUser(cached!.owner.uid);
        cached!.owner.last_sign_in_at = authUser.metadata.lastSignInTime
          ? new Date(authUser.metadata.lastSignInTime).toISOString()
          : null;
      } catch {
        // ignore
      }
    }
    return NextResponse.json({ snapshot: cached });
  } catch (error) {
    console.error(`[GET /api/platform/orgs/${id}]`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/platform/orgs/[id]
 *
 * Force-recomputes the snapshot for a single org. Used by the "Recompute"
 * button on the detail page when investigating.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const fresh = await buildOrgSnapshot(id, true);
    if (!fresh) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }
    await adminDb.doc(`platform_orgs/${id}`).set(fresh);
    return NextResponse.json({ snapshot: fresh });
  } catch (error) {
    console.error(`[POST /api/platform/orgs/${id}]`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
