import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isPlatformAdmin } from "@/lib/utils/platform-admin";

/**
 * POST /api/platform/orgs/[id]/suspend
 * Body: { suspended: boolean, reason?: string }
 *
 * Platform-admin action to mark an org as suspended (or restore it).
 * Suspended orgs have `suspended_at` and `suspended_reason` set on the
 * church doc. The dashboard layout's auth-context hook detects this
 * and redirects members to /account/suspended.
 *
 * Pass G Phase 5. Reversible — to unsuspend, POST with { suspended: false }.
 * Data is preserved; this is a soft block, not a delete.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing org id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const suspended = body.suspended === true;
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;

  const ref = adminDb.doc(`churches/${id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }

  if (suspended) {
    await ref.update({
      suspended_at: new Date().toISOString(),
      suspended_by: decoded.uid,
      suspended_reason: reason,
    });
  } else {
    // Unsuspend — clear all three fields
    await ref.update({
      suspended_at: null,
      suspended_by: null,
      suspended_reason: null,
    });
  }

  return NextResponse.json({ success: true, suspended });
}
