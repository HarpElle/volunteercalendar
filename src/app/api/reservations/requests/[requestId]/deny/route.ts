import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { sendSms } from "@/lib/services/sms";

/**
 * POST /api/reservations/requests/[requestId]/deny
 * Deny a pending reservation request. Admin only. Reason required.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const { requestId } = await params;
    const body = await req.json();
    const { church_id, admin_note } = body;
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const memberSnap = await adminDb
      .doc(`memberships/${userId}_${church_id}`)
      .get();
    if (!memberSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = memberSnap.data()!.role as string;
    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const requestRef = adminDb.doc(
      `churches/${church_id}/reservation_requests/${requestId}`,
    );
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const requestData = requestSnap.data()!;
    if (requestData.status !== "pending") {
      return NextResponse.json(
        { error: "Request already reviewed" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    // Update request
    await requestRef.update({
      status: "denied",
      admin_note: admin_note || null,
      reviewed_by: userId,
      reviewed_at: now,
    });

    // Update reservation status
    const reservationRef = adminDb.doc(
      `churches/${church_id}/reservations/${requestData.new_reservation_id}`,
    );
    await reservationRef.update({
      status: "denied",
      denied_by: userId,
      denied_at: now,
      denied_reason: admin_note || "",
      updated_at: now,
    });

    // Notify requester
    const reservationSnap = await reservationRef.get();
    const reservation = reservationSnap.data();
    if (reservation) {
      const requesterMemberSnap = await adminDb
        .doc(`memberships/${reservation.requested_by}_${church_id}`)
        .get();
      const phone = requesterMemberSnap.data()?.phone;
      if (phone) {
        await sendSms({
          to: phone,
          body: `Your reservation request for "${reservation.title}" on ${reservation.date} was not approved.${admin_note ? ` Note: ${admin_note}` : ""}`,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
