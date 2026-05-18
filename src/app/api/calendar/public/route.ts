import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { todayInTimezone } from "@/lib/utils/date";

/**
 * GET /api/calendar/public?church_id=...&token=...&date_from=...&date_to=...
 *  OR
 * GET /api/calendar/public?token=...  (church_id auto-resolved)
 *
 * Public, no-auth JSON endpoint that backs /calendar/public.
 *
 * Why this exists:
 *   Before PR #23 the page called /api/reservations?public_token=... which
 *   required a Bearer token and returned 401. Public viewers don't have
 *   accounts, so the page rendered "Public calendar not available." This
 *   endpoint validates the `public_calendar_token` from the church's
 *   roomSettings instead, mirroring the existing church iCal endpoint at
 *   /api/calendar/church/[churchId]/[calendarToken].
 *
 * Returns:
 *   {
 *     church: { id, name, timezone },
 *     rooms:  [{ id, name }],          // public_visible rooms only
 *     reservations: [{ id, room_id, room_name, title, date, start_time, end_time }],
 *     today:  "YYYY-MM-DD",            // in church timezone
 *   }
 *
 * Excludes cancelled + denied reservations. Hides rooms with
 * public_visible === false.
 */
export async function GET(req: NextRequest) {
  try {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000 });
    if (rl) return rl;

    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // Resolve church_id from query, or look it up via the public_calendar_token
    // collection-group exemption (added in firestore.indexes.json).
    let churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      const settingsSnap = await adminDb
        .collectionGroup("roomSettings")
        .where("public_calendar_token", "==", token)
        .limit(1)
        .get();
      if (settingsSnap.empty) {
        return NextResponse.json(
          { error: "Public calendar not found" },
          { status: 404 },
        );
      }
      const parentChurch = settingsSnap.docs[0].ref.parent.parent;
      if (!parentChurch) {
        return NextResponse.json(
          { error: "Public calendar not found" },
          { status: 404 },
        );
      }
      churchId = parentChurch.id;
    }

    // Validate token + enabled flag against the church's roomSettings
    const settingsSnap = await adminDb
      .doc(`churches/${churchId}/roomSettings/config`)
      .get();
    if (!settingsSnap.exists) {
      return NextResponse.json(
        { error: "Public calendar not configured" },
        { status: 404 },
      );
    }
    const settings = settingsSnap.data()!;
    if (settings.public_calendar_token !== token) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }
    if (settings.public_calendar_enabled === false) {
      return NextResponse.json(
        { error: "Public calendar disabled" },
        { status: 403 },
      );
    }

    // Church metadata + timezone for the response's `today` field
    const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
    const churchData = churchSnap.exists ? churchSnap.data()! : {};
    const timezone = (churchData.timezone as string) || "UTC";
    const churchName = (churchData.name as string) || "Calendar";

    // Date window. Defaults: today (in church TZ) → +30 days.
    const dateFrom =
      req.nextUrl.searchParams.get("date_from") || todayInTimezone(timezone);
    let dateTo = req.nextUrl.searchParams.get("date_to");
    if (!dateTo) {
      const [ty, tm, td] = dateFrom.split("-").map(Number);
      const anchor = new Date(Date.UTC(ty, tm - 1, td));
      anchor.setUTCDate(anchor.getUTCDate() + 30);
      dateTo = anchor.toISOString().split("T")[0];
    }

    // Rooms — only public_visible ones contribute to public calendar
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

    // Reservations in window — confirmed only, excluding cancelled/denied
    const reservationsSnap = await adminDb
      .collection(`churches/${churchId}/reservations`)
      .where("status", "==", "confirmed")
      .where("date", ">=", dateFrom)
      .where("date", "<=", dateTo)
      .get();

    const reservations = reservationsSnap.docs
      .filter((d) => roomMap.has(d.data().room_id as string))
      .map((d) => {
        const r = d.data();
        return {
          id: d.id,
          room_id: r.room_id as string,
          room_name: roomMap.get(r.room_id as string) || null,
          title: (r.title as string) || "Reservation",
          date: r.date as string,
          start_time: r.start_time as string,
          end_time: r.end_time as string,
        };
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.start_time.localeCompare(b.start_time);
      });

    return NextResponse.json({
      church: { id: churchId, name: churchName, timezone },
      rooms: [...roomMap.entries()].map(([id, name]) => ({ id, name })),
      reservations,
      today: todayInTimezone(timezone),
    });
  } catch (e) {
    console.error("[GET /api/calendar/public]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
