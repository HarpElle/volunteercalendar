import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isPlatformAdmin } from "@/lib/utils/platform-admin";
import { log } from "@/lib/log";

/**
 * GET /api/platform/cron-runs?days=7
 *
 * Reads the cron_runs collection (written by withCronRun wrapper, Wave 2.3).
 * Returns the most recent rows, optionally filtered by lookback window.
 * Platform-admin only.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    if (!isPlatformAdmin(decoded.uid)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const days = Math.max(
      1,
      Math.min(30, parseInt(req.nextUrl.searchParams.get("days") ?? "7", 10) || 7),
    );
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const snap = await adminDb
      .collection("cron_runs")
      .where("started_at", ">=", cutoff)
      .orderBy("started_at", "desc")
      .limit(500)
      .get();

    const runs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ runs, lookback_days: days });
  } catch (error) {
    log.error("GET /api/platform/cron-runs failed", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
