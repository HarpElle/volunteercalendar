/**
 * GET /api/admin/kiosk-commands/[id]?church_id=...
 *
 * Admin polls a specific command for its result. Used by the
 * Stations UI to show "Test print sent" / "Failed: {reason}" /
 * "Waiting for kiosk to pick up..." inline after enqueueing.
 *
 * Auth: Bearer admin/owner.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: commandId } = await params;
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const membershipSnap = await adminDb
      .doc(`memberships/${userId}_${churchId}`)
      .get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only owners and admins can view kiosk commands" },
        { status: 403 },
      );
    }

    const snap = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("kiosk_commands")
      .doc(commandId)
      .get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 });
    }
    return NextResponse.json({ command: snap.data() });
  } catch (error) {
    console.error("[GET /api/admin/kiosk-commands/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
