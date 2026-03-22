import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { generateICalFeed } from "@/lib/utils/ical";

/**
 * GET /api/calendar/room/[roomId]/[calendarToken]
 * Per-room iCal feed. Token auth via URL path segment.
 * Returns confirmed reservations within a 90-day window.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string; calendarToken: string }> },
) {
  try {
    const { roomId, calendarToken } = await params;

    // Find the room by scanning churches — we need to locate which church owns this room
    // First try the room_calendar_tokens lookup collection for O(1) access
    const tokenSnap = await adminDb
      .collectionGroup("rooms")
      .where("calendar_token", "==", calendarToken)
      .limit(1)
      .get();

    if (tokenSnap.empty) {
      return new NextResponse("Feed not found", { status: 404 });
    }

    const roomDoc = tokenSnap.docs[0];
    if (roomDoc.id !== roomId) {
      return new NextResponse("Token mismatch", { status: 403 });
    }

    const roomData = roomDoc.data();
    const churchId = roomDoc.ref.parent.parent?.id;
    if (!churchId) {
      return new NextResponse("Invalid room path", { status: 500 });
    }

    // Get church timezone
    const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
    const timezone =
      (churchSnap.data()?.timezone as string) || "America/New_York";

    // Query confirmed reservations in 90-day window
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 60);

    const reservationsSnap = await adminDb
      .collection(`churches/${churchId}/reservations`)
      .where("room_id", "==", roomId)
      .where("status", "==", "confirmed")
      .where("date", ">=", startDate.toISOString().split("T")[0])
      .where("date", "<=", endDate.toISOString().split("T")[0])
      .get();

    const events = reservationsSnap.docs.map((doc) => {
      const d = doc.data();
      const [startH, startM] = (d.start_time as string).split(":").map(Number);
      const [endH, endM] = (d.end_time as string).split(":").map(Number);
      const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);

      return {
        uid: doc.id,
        summary: d.title as string,
        description: d.setup_notes
          ? `Setup: ${d.setup_notes}`
          : "",
        dtstart: d.date as string,
        startTime: d.start_time as string,
        durationMinutes: durationMinutes > 0 ? durationMinutes : 60,
        location: roomData.name as string,
      };
    });

    const ical = generateICalFeed(
      `${roomData.name} - Room Calendar`,
      events,
      timezone,
    );

    return new NextResponse(ical, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${(roomData.name as string).replace(/[^a-zA-Z0-9]/g, "_")}_calendar.ics"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (e) {
    console.error("Room iCal feed error:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
