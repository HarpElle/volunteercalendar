import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * DELETE /api/volunteers/[id]/remove
 *
 * Permanently remove a volunteer from an organization.
 * Deletes the volunteer record and, if they have a user account,
 * also deletes their membership so they lose org access.
 *
 * Requires admin or owner role.
 */
export async function DELETE(
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

    const { church_id } = await req.json();
    if (!church_id) {
      return NextResponse.json(
        { error: "church_id is required" },
        { status: 400 },
      );
    }

    // Verify membership + admin/owner role
    const membershipSnap = await adminDb
      .doc(`memberships/${userId}_${church_id}`)
      .get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Admin or owner required" },
        { status: 403 },
      );
    }

    const { id: volunteerId } = await params;
    const volRef = adminDb.doc(
      `churches/${church_id}/volunteers/${volunteerId}`,
    );
    const volSnap = await volRef.get();
    if (!volSnap.exists) {
      return NextResponse.json(
        { error: "Volunteer not found" },
        { status: 404 },
      );
    }

    const volData = volSnap.data()!;
    const volunteerUserId = volData.user_id as string | null;

    // Delete volunteer record
    await volRef.delete();

    // If volunteer has a linked user account, also remove their membership
    if (volunteerUserId) {
      const memRef = adminDb.doc(
        `memberships/${volunteerUserId}_${church_id}`,
      );
      const memSnap = await memRef.get();
      if (memSnap.exists) {
        await memRef.delete();
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/volunteers/[id]/remove]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
