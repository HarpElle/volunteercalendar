import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { generateICalFeed } from "@/lib/utils/ical";
import { rateLimit } from "@/lib/utils/rate-limit";

/**
 * GET /api/calendar/ministry/[ministryId]/[calendarToken]
 * Per-ministry room iCal feed. Shows reservations linked to a ministry.
 * Token validated against roomSettings.public_calendar_token.
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ ministryId: string; calendarToken: string }> },
) {
  try {
    const rl = await rateLimit(request, { limit: 60, windowMs: 60_000 });
    if (rl) return rl;

    const { ministryId, calendarToken } = await params;

    // Find which church this ministry belongs to
    const ministrySnap = await adminDb
      .collectionGroup("ministries")
      .where("__name__", "==", ministryId)
      .limit(1)
      .get();

    // Fallback: search by iterating — collectionGroup __name__ filtering
    // is unreliable, so we validate the token against all churches' roomSettings
    let churchId: string | null = null;

    const settingsSnap = await adminDb
      .collectionGroup("roomSettings")
      .where("public_calendar_token", "==", calendarToken)
      .limit(1)
      .get();

    if (settingsSnap.empty) {
      return new NextResponse("Feed not found", { status: 404 });
    }

    const settingsDoc = settingsSnap.docs[0];
    churchId = settingsDoc.ref.parent.parent?.id || null;

    if (!churchId) {
      return new NextResponse("Invalid configuration", { status: 500 });
    }

    const settings = settingsDoc.data();
    if (!settings.public_calendar_enabled) {
      return new NextResponse("Public calendar disabled", { status: 403 });
    }

    // Verify ministry exists in this church
    const ministryDoc = await adminDb
      .doc(`churches/${churchId}/ministries/${ministryId}`)
      .get();
    if (!ministryDoc.exists) {
      return new NextResponse("Ministry not found", { status: 404 });
    }
    const ministryName =
      (ministryDoc.data()?.name as string) || "Ministry";

    // Get church timezone
    const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
    const timezone =
      (churchSnap.data()?.timezone as string) || "America/New_York";

    // Build room name lookup
    const roomsSnap = await adminDb
      .collection(`churches/${churchId}/rooms`)
      .where("is_active", "==", true)
      .get();
    const roomMap = new Map<string, string>();
    for (const doc of roomsSnap.docs) {
      roomMap.set(doc.id, (doc.data().name as string) || "Room");
    }

    // Query confirmed reservations for this ministry in 90-day window
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 60);

    const reservationsSnap = await adminDb
      .collection(`churches/${churchId}/reservations`)
      .where("ministry_id", "==", ministryId)
      .where("status", "==", "confirmed")
      .where("date", ">=", startDate.toISOString().split("T")[0])
      .where("date", "<=", endDate.toISOString().split("T")[0])
      .get();

    const events = reservationsSnap.docs.map((doc) => {
      const d = doc.data();
      const roomName = roomMap.get(d.room_id as string) || "Room";
      const [startH, startM] = (d.start_time as string)
        .split(":")
        .map(Number);
      const [endH, endM] = (d.end_time as string).split(":").map(Number);
      const durationMinutes = endH * 60 + endM - (startH * 60 + startM);

      return {
        uid: doc.id,
        summary: `${d.title} (${roomName})`,
        description: d.setup_notes
          ? `Room: ${roomName}\nSetup: ${d.setup_notes}`
          : `Room: ${roomName}`,
        dtstart: d.date as string,
        startTime: d.start_time as string,
        durationMinutes: durationMinutes > 0 ? durationMinutes : 60,
        location: roomName,
      };
    });

    const ical = generateICalFeed(
      `${ministryName} - Room Calendar`,
      events,
      timezone,
    );

    return new NextResponse(ical, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${ministryName.replace(/[^a-zA-Z0-9]/g, "_")}_rooms.ics"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (e) {
    console.error("Ministry iCal feed error:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
