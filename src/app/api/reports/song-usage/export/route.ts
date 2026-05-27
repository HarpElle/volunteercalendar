import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { TIER_LIMITS } from "@/lib/constants";
import { audit, userActor } from "@/lib/server/audit";
import type { SongUsageRecord } from "@/lib/types";

/**
 * GET /api/reports/song-usage/export?church_id=xxx&from=2026-01-01&to=2026-03-31&format=csv
 * Export song usage data as CSV for CCLI reporting.
 */
export async function GET(req: NextRequest) {
  try {
    // Standardized worship-tier short-circuit for Free/Starter callers.
    // Codex Phase 6 Pass A pattern: gate by tier BEFORE other lookups.
    const gate = await requireModuleTier(req, "worship");
    if (!gate.ok) return gate.response;
    const { churchId, role, userId } = gate.ctx;

    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const format = searchParams.get("format") ?? "csv";

    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Fetch church CCLI number AND tier for gate enforcement
    const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
    const churchData = churchSnap.data();
    const churchCcliNumber = (churchData?.ccli_number as string) || "";

    // Codex QA 2026-05-15: CSV export for CCLI is gated by tier. Landing
    // page promises it on Growth+; constants and this endpoint now enforce
    // that. Free/Starter get 403 with an upgrade hint. This finer-grained
    // ccli_csv_export check is redundant with the worship gate above but
    // provides a more specific error message for downstream callers.
    const tier = (churchData?.subscription_tier as string) || "free";
    const tierLimits = TIER_LIMITS[tier] || TIER_LIMITS.free;
    if (!tierLimits.ccli_csv_export) {
      return NextResponse.json(
        {
          error:
            "CCLI CSV export is included on the Growth plan and above. Upgrade your plan to unlock this report.",
        },
        { status: 403 },
      );
    }

    // Query song usage records
    let query: FirebaseFirestore.Query = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("song_usage")
      .orderBy("service_date", "desc");

    if (from) {
      query = query.where("service_date", ">=", from);
    }
    if (to) {
      query = query.where("service_date", "<=", to);
    }

    const snap = await query.get();
    const records: SongUsageRecord[] = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as SongUsageRecord[];

    if (format === "csv") {
      // Generate CSV for CCLI compliance
      const header = "Church CCLI #,Song Title,CCLI Number,Service Date,Service Name,Key Used";
      const rows = records.map((r) =>
        [
          churchCcliNumber,
          csvEscape(r.song_title),
          r.ccli_number ?? "",
          r.service_date,
          csvEscape(r.service_name),
          r.key_used ?? "",
        ].join(","),
      );

      const csv = [header, ...rows].join("\n");
      const dateLabel = from && to ? `${from}_to_${to}` : "all";

      // Wave 4.1: CCLI CSV export is a sensitive (licensing-trail) export
      // that gates on Growth+ — worth its own row in the Activity feed so
      // org admins can see who pulled the report each cycle.
      void audit({
        church_id: churchId,
        actor: userActor(userId),
        action: "export.song_usage",
        target_type: "song_usage_report",
        target_id: null,
        metadata: {
          from: from || null,
          to: to || null,
          record_count: records.length,
          format: "csv",
        },
        outcome: "ok",
      });

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="song-usage_${dateLabel}.csv"`,
        },
      });
    }

    // Default: JSON
    return NextResponse.json({ records, total: records.length });
  } catch (error) {
    console.error("[GET /api/reports/song-usage/export]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
