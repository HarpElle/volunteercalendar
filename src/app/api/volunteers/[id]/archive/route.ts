import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * PATCH /api/volunteers/[id]/archive
 *
 * Archive or restore a volunteer.
 * - archive: sets status to "archived", clears ministry_ids and role_ids
 * - restore: sets status to "active" (user re-adds to teams manually)
 *
 * Requires admin or scheduler role.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const { church_id, action } = await req.json();
    if (!church_id || !action || !["archive", "restore"].includes(action)) {
      return NextResponse.json(
        { error: "church_id and action (archive|restore) required" },
        { status: 400 },
      );
    }

    // Verify membership + role
    const membershipSnap = await adminDb
      .doc(`memberships/${userId}_${church_id}`)
      .get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json(
        { error: "Scheduler or above required" },
        { status: 403 },
      );
    }

    const { id: volunteerId } = await params;
    const volRef = adminDb.doc(
      `churches/${church_id}/people/${volunteerId}`,
    );
    const volSnap = await volRef.get();
    if (!volSnap.exists) {
      return NextResponse.json(
        { error: "Volunteer not found" },
        { status: 404 },
      );
    }

    if (action === "archive") {
      await volRef.update({
        status: "archived",
        ministry_ids: [],
        role_ids: [],
      });
    } else {
      await volRef.update({ status: "active" });
    }

    const updated = await volRef.get();
    return NextResponse.json({ success: true, volunteer: { id: updated.id, ...updated.data() } });
  } catch (error) {
    console.error("[PATCH /api/volunteers/[id]/archive]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
