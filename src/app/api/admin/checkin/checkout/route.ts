import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * POST /api/admin/checkin/checkout
 * Authenticated admin/scheduler checkout — no security code required.
 * Body: { church_id, session_id }
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const body = await req.json();
    const { church_id, session_id } = body as {
      church_id: string;
      session_id: string;
    };

    if (!church_id || !session_id) {
      return NextResponse.json(
        { error: "Missing church_id or session_id" },
        { status: 400 },
      );
    }

    // Verify membership (scheduler+ or checkin_volunteer)
    const membershipSnap = await adminDb
      .doc(`memberships/${userId}_${church_id}`)
      .get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const membership = membershipSnap.data()!;
    const role = membership.role as string;
    const isCheckinVolunteer = membership.checkin_volunteer === true;

    if (!["owner", "admin", "scheduler"].includes(role) && !isCheckinVolunteer) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(church_id);
    const sessionRef = churchRef.collection("checkInSessions").doc(session_id);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 },
      );
    }

    const session = sessionSnap.data()!;
    if (session.checked_out_at) {
      return NextResponse.json(
        { error: "Already checked out" },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    await sessionRef.update({
      checked_out_at: now,
      checked_out_by_user_id: userId,
    });

    // Load child name
    const childSnap = await churchRef
      .collection("children")
      .doc(session.child_id)
      .get();
    const childName = childSnap.exists
      ? `${childSnap.data()!.preferred_name || childSnap.data()!.first_name} ${childSnap.data()!.last_name}`
      : "Unknown";

    return NextResponse.json({
      success: true,
      child_name: childName,
      room_name: session.room_name,
      checked_out_at: now,
    });
  } catch (error) {
    console.error("[POST /api/admin/checkin/checkout]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
