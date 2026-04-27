import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { assertKioskChurchMatch, requireKioskToken } from "@/lib/server/authz";
import { SHORT_CODE_RE, generateShortCode, resolveShortCode } from "@/lib/utils/short-code";
import type { CheckInSettings, CheckInServiceTime } from "@/lib/types";

/**
 * GET /api/checkin/services?church_id=...
 * Kiosk endpoint — returns today's active service times for a church.
 * Accepts a full church_id OR a 6-char setup code (short_code).
 * Requires X-Kiosk-Token header (see src/lib/server/authz.ts).
 */
export async function GET(req: NextRequest) {
  const kiosk = await requireKioskToken(req, "services");
  if (kiosk instanceof NextResponse) return kiosk;

  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const rawId = req.nextUrl.searchParams.get("church_id");
    if (!rawId) {
      return NextResponse.json(
        { error: "Missing church_id" },
        { status: 400 },
      );
    }

    // Resolve: try direct doc lookup first, then short_code query
    let churchId = rawId;
    let churchSnap = await adminDb.collection("churches").doc(rawId).get();

    if (!churchSnap.exists && SHORT_CODE_RE.test(rawId.toUpperCase())) {
      const resolved = await resolveShortCode(rawId);
      if (resolved) {
        churchId = resolved;
        churchSnap = await adminDb.collection("churches").doc(churchId).get();
      }
    }

    if (!churchSnap.exists) {
      return NextResponse.json(
        { error: "Church not found" },
        { status: 404 },
      );
    }

    // Bind: kiosk's church_id must match the resolved one.
    const churchMismatch = assertKioskChurchMatch(kiosk, churchId);
    if (churchMismatch) return churchMismatch;

    const churchData = churchSnap.data()!;
    const churchName = churchData.name as string;

    // Backfill short_code for existing churches that don't have one
    if (!churchData.short_code) {
      try {
        const code = await generateShortCode();
        await adminDb.collection("churches").doc(churchId).update({ short_code: code });
      } catch {
        // Non-critical — will retry on next request
      }
    }

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
