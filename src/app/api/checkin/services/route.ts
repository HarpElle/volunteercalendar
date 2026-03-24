import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import type { CheckInSettings, CheckInServiceTime } from "@/lib/types";

/**
 * GET /api/checkin/services?church_id=...
 * Public endpoint — returns today's active service times for a church.
 * If only one service matches today, the kiosk can auto-select it.
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json(
        { error: "Missing church_id" },
        { status: 400 },
      );
    }

    // Load church doc for name
    const churchSnap = await adminDb.collection("churches").doc(churchId).get();
    const churchName = churchSnap.exists
      ? (churchSnap.data()!.name as string)
      : "";

    const settingsSnap = await adminDb
      .doc(`churches/${churchId}/checkinSettings/config`)
      .get();

    if (!settingsSnap.exists) {
      return NextResponse.json({ services: [], church_name: churchName });
    }

    const settings = settingsSnap.data() as CheckInSettings;
    const now = new Date();
    const todayDow = now.getDay(); // 0=Sunday

    // Filter to today's services
    const todayServices: (CheckInServiceTime & { is_current: boolean })[] =
      (settings.service_times || [])
        .filter((st) => st.day_of_week === todayDow)
        .map((st) => {
          const [startH, startM] = st.start_time.split(":").map(Number);
          const [endH, endM] = st.end_time.split(":").map(Number);
          const nowMinutes = now.getHours() * 60 + now.getMinutes();
          const startMinutes = startH * 60 + startM;
          const endMinutes = endH * 60 + endM;

          return {
            ...st,
            is_current: nowMinutes >= startMinutes - 30 && nowMinutes <= endMinutes,
          };
        });

    return NextResponse.json({ services: todayServices, church_name: churchName });
  } catch (error) {
    console.error("[GET /api/checkin/services]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
