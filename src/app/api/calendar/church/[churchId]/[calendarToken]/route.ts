import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { generateICalFeed } from "@/lib/utils/ical";
import { rateLimitDistributed } from "@/lib/server/rate-limit";
import { clampFeedDateRange } from "@/lib/server/calendar-feed";

/**
 * GET /api/calendar/church/[churchId]/[calendarToken]
 * Church-wide room iCal feed. Aggregates all rooms.
 * Token validated against roomSettings.public_calendar_token.
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ churchId: string; calendarToken: string }> },
) {
  try {
    const rl = await rateLimitDistributed(request, {
      prefix: "calendar-church",
      limit: 60,
      windowSeconds: 60,
    });
    if (rl) return rl;

    const { churchId, calendarToken } = await params;

    // Validate token against room settings
    const settingsSnap = await adminDb
      .doc(`churches/${churchId}/roomSettings/config`)
      .get();
    if (!settingsSnap.exists) {
      return new NextResponse("Feed not configured", { status: 404 });
    }

    const settings = settingsSnap.data()!;
    if (settings.public_calendar_token !== calendarToken) {
      return new NextResponse("Invalid token", { status: 403 });
    }

    if (!settings.public_calendar_enabled) {
      return new NextResponse("Public calendar disabled", { status: 403 });
    }

    // Get church name + timezone
    const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
    const churchName =
      (churchSnap.data()?.name as string) || "Church";
    const timezone =
      (churchSnap.data()?.timezone as string) || "America/New_York";

    // Build room name lookup (only public_visible rooms)
    const roomsSnap = await adminDb
      .collection(`churches/${churchId}/rooms`)
      .where("is_active", "==", true)
      .get();
    const roomMap = new Map<string, string>();
    for (const doc of roomsSnap.docs) {
      const data = doc.data();
      if (data.public_visible !== false) {
        roomMap.set(doc.id, (data.name as string) || "Room");
      }
    }

    if (roomMap.size === 0) {
      const ical = generateICalFeed(
        `${churchName} - Room Calendar`,
        [],
        timezone,
      );
      return new NextResponse(ical, {
        status: 200,
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // Query confirmed reservations — date range clamped to max 365 days.
    // Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD overrides the default
    // 30-back / 90-forward window.
    const fromRaw = request.nextUrl.searchParams.get("from");
    const toRaw = request.nextUrl.searchParams.get("to");
    const { from: startDate, to: endDate } = clampFeedDateRange(fromRaw, toRaw);

    const reservationsSnap = await adminDb
      .collection(`churches/${churchId}/reservations`)
      .where("status", "==", "confirmed")
      .where("date", ">=", startDate.toISOString().split("T")[0])
      .where("date", "<=", endDate.toISOString().split("T")[0])
      .get();

    const events = reservationsSnap.docs
      .filter((doc) => roomMap.has(doc.data().room_id as string))
      .map((doc) => {
        const d = doc.data();
        const roomName = roomMap.get(d.room_id as string) || "Room";
        const [startH, startM] = (d.start_time as string)
          .split(":")
          .map(Number);
        const [endH, endM] = (d.end_time as string).split(":").map(Number);
        const durationMinutes = endH * 60 + endM - (startH * 60 + startM);

        return {
          uid: doc.id,
          summary: `${roomName}: ${d.title}`,
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
      `${churchName} - Room Calendar`,
      events,
      timezone,
    );

    return new NextResponse(ical, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${churchName.replace(/[^a-zA-Z0-9]/g, "_")}_rooms.ics"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (e) {
    console.error("Church iCal feed error:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
