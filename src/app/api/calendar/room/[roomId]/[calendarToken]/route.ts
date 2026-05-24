import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { generateICalFeed } from "@/lib/utils/ical";
import { rateLimitDistributed } from "@/lib/server/rate-limit";
import {
  clampFeedDateRange,
  touchRoomLastAccessed,
} from "@/lib/server/calendar-feed";

/**
 * GET /api/calendar/room/[roomId]/[calendarToken]
 * Per-room iCal feed. Token auth via URL path segment.
 * Returns confirmed reservations within a 90-day window.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string; calendarToken: string }> },
) {
  try {
    const rl = await rateLimitDistributed(request, {
      prefix: "calendar-room",
      limit: 60,
      windowSeconds: 60,
    });
    if (rl) return rl;

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
      // Don't leak whether the token exists for a different room.
      return new NextResponse("Feed not found", { status: 404 });
    }

    const roomData = roomDoc.data();
    const churchId = roomDoc.ref.parent.parent?.id;
    if (!churchId) {
      return new NextResponse("Feed not found", { status: 404 });
    }

    // Token validated — fire-and-forget bump of last_accessed so admins
    // can see whether the feed is actually being subscribed.
    touchRoomLastAccessed(adminDb, churchId, roomId);

    // Get church timezone
    const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
    const timezone =
      (churchSnap.data()?.timezone as string) || "America/New_York";

    // Query confirmed reservations — date range clamped to max 365 days.
    // Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD overrides the default
    // 30-back / 90-forward window. The helper anchors to UTC; previous
    // hand-rolled logic anchored to the church's local "today" — for a
    // ±30/60 day window the off-by-one-day at midnight UTC is harmless.
    const fromRaw = request.nextUrl.searchParams.get("from");
    const toRaw = request.nextUrl.searchParams.get("to");
    const { from: startDate, to: endDate } = clampFeedDateRange(fromRaw, toRaw);

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
    const raw = e instanceof Error ? e.message : "Internal error";
    const friendly = raw.includes("FAILED_PRECONDITION")
      ? "Calendar feed is initializing. Please try again in a minute."
      : raw;
    return new NextResponse(friendly, { status: 500 });
  }
}
