import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requirePlatformAdmin } from "@/lib/server/authz";
import { buildOrgSnapshot } from "@/lib/server/org-snapshot";
import type { OrgSnapshot } from "@/lib/types/platform";
import { log } from "@/lib/log";

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
  // Suppress unused warning — auth is the proof we got past the gate.
  void auth;

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
    log.error("GET /api/platform/orgs/[id] failed", { error, org_id: id });
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
  void auth;

  const { id } = await params;
  try {
    const fresh = await buildOrgSnapshot(id, true);
    if (!fresh) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }
    await adminDb.doc(`platform_orgs/${id}`).set(fresh);
    return NextResponse.json({ snapshot: fresh });
  } catch (error) {
    log.error("POST /api/platform/orgs/[id] failed", { error, org_id: id });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
