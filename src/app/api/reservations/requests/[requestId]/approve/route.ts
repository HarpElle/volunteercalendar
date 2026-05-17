import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { sendSms } from "@/lib/services/sms";

/**
 * POST /api/reservations/requests/[requestId]/approve
 * Approve a pending reservation request. Admin only.
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
      status: "approved",
      admin_note: admin_note || null,
      reviewed_by: userId,
      reviewed_at: now,
    });

    // Update reservation status. If this request came from a recurring
    // booking, the queue doc carries `recurrence_group_id` and we approve
    // every occurrence in the group in one batch — so the admin doesn't
    // have to approve 12 weeks individually.
    const reservationRef = adminDb.doc(
      `churches/${church_id}/reservations/${requestData.new_reservation_id}`,
    );
    const groupId = requestData.recurrence_group_id as string | undefined;
    if (groupId) {
      const groupSnap = await adminDb
        .collection(`churches/${church_id}/reservations`)
        .where("recurrence_group_id", "==", groupId)
        .get();
      const batch = adminDb.batch();
      for (const doc of groupSnap.docs) {
        // Only flip docs that are still pending; never resurrect a
        // cancelled/denied occurrence.
        if (doc.data().status === "pending_approval") {
          batch.update(doc.ref, {
            status: "confirmed",
            approved_by: userId,
            approved_at: now,
            updated_at: now,
          });
        }
      }
      await batch.commit();
    } else {
      await reservationRef.update({
        status: "confirmed",
        approved_by: userId,
        approved_at: now,
        updated_at: now,
      });
    }

    // Notify requester via SMS
    const reservationSnap = await reservationRef.get();
    const reservation = reservationSnap.data();
    if (reservation) {
      // Look up requester's phone
      const requesterMemberSnap = await adminDb
        .doc(`memberships/${reservation.requested_by}_${church_id}`)
        .get();
      const phone = requesterMemberSnap.data()?.phone;
      if (phone) {
        const roomSnap = await adminDb
          .doc(`churches/${church_id}/rooms/${reservation.room_id}`)
          .get();
        const roomName = roomSnap.data()?.name || "Room";
        await sendSms({
          to: phone,
          body: `Your reservation for "${reservation.title}" on ${reservation.date} at ${reservation.start_time} in ${roomName} has been approved.`,
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
