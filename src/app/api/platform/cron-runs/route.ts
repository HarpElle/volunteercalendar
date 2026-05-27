import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requirePlatformAdmin } from "@/lib/server/authz";
import { parseQuery, z } from "@/lib/server/validation";
import { log } from "@/lib/log";

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
});

/**
 * GET /api/platform/cron-runs?days=7
 *
 * Reads the cron_runs collection (written by withCronRun wrapper, Wave 2.3).
 * Returns the most recent rows, optionally filtered by lookback window.
 * Platform-admin only.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const query = parseQuery(req, QuerySchema);
  if (query instanceof NextResponse) return query;

  try {
    const cutoff = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000).toISOString();

    const snap = await adminDb
      .collection("cron_runs")
      .where("started_at", ">=", cutoff)
      .orderBy("started_at", "desc")
      .limit(500)
      .get();

    const runs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ runs, lookback_days: query.days });
  } catch (error) {
    log.error("GET /api/platform/cron-runs failed", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
