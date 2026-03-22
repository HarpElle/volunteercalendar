import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/display/room/[roomId]?token=...&church_id=...
 * Public endpoint for room display signage. Token auth via query param.
 * Returns today's reservations + server time for countdown display.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    const token = req.nextUrl.searchParams.get("token");
    const churchId = req.nextUrl.searchParams.get("church_id");

    if (!token || !churchId) {
      return NextResponse.json(
        { error: "Missing token or church_id" },
        { status: 400 },
      );
    }

    // Validate token against room's calendar_token
    const roomRef = adminDb.doc(`churches/${churchId}/rooms/${roomId}`);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const roomData = roomSnap.data()!;
    if (roomData.calendar_token !== token) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    // Get today's confirmed reservations for this room
    const today = new Date().toISOString().split("T")[0];
    const reservationsSnap = await adminDb
      .collection(`churches/${churchId}/reservations`)
      .where("room_id", "==", roomId)
      .where("date", "==", today)
      .where("status", "==", "confirmed")
      .orderBy("start_time", "asc")
      .get();

    const reservations = reservationsSnap.docs.map((doc) => ({
      id: doc.id,
      title: doc.data().title,
      start_time: doc.data().start_time,
      end_time: doc.data().end_time,
      ministry_id: doc.data().ministry_id,
      requested_by_name: doc.data().requested_by_name,
      setup_notes: doc.data().setup_notes,
    }));

    return NextResponse.json({
      room: {
        id: roomSnap.id,
        name: roomData.name,
        capacity: roomData.capacity || null,
        equipment: roomData.equipment || [],
      },
      date: today,
      server_time: new Date().toISOString(),
      reservations,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
