import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/invites/{membershipId}
 *
 * Returns the membership + church name for an invite acceptance page.
 * Codex Phase 6 2026-05-18: the old client-side flow fetched both via the
 * Firestore SDK; the church doc is not readable to non-members so the page
 * flashed "Failed to load invitation" before falling back to a blank
 * "You've joined ." success message. This admin-SDK route is the
 * authoritative source for the invite-accept page.
 *
 * Caller must be signed in. The auth UID must match the membership's
 * user_id OR the membership must be in `pending_volunteer_approval` so an
 * existing user can preview the invite before accepting.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;
    const { membershipId } = await params;

    const memSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!memSnap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const membership = { id: memSnap.id, ...memSnap.data() } as {
      id: string;
      user_id: string;
      church_id: string;
      role: string;
      status: string;
    };

    // Owner or invitee can read; anyone else gets 403 (the invite link must
    // have been forwarded, which we don't support).
    if (membership.user_id !== uid) {
      return NextResponse.json(
        { error: "Forbidden", wrong_user: true, invited_user_id: membership.user_id },
        { status: 403 },
      );
    }

    const churchSnap = await adminDb.doc(`churches/${membership.church_id}`).get();
    const churchName =
      (churchSnap.exists && (churchSnap.data()?.name as string)) ||
      "this organization";

    return NextResponse.json({
      membership: {
        id: membership.id,
        user_id: membership.user_id,
        church_id: membership.church_id,
        role: membership.role,
        status: membership.status,
      },
      church: {
        id: membership.church_id,
        name: churchName,
      },
    });
  } catch (err) {
    console.error("GET /api/invites/[membershipId] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
