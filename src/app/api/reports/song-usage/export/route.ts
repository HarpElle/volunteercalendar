import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { SongUsageRecord } from "@/lib/types";

/**
 * GET /api/reports/song-usage/export?church_id=xxx&from=2026-01-01&to=2026-03-31&format=csv
 * Export song usage data as CSV for CCLI reporting.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const { searchParams } = req.nextUrl;
    const churchId = searchParams.get("church_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const format = searchParams.get("format") ?? "csv";

    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify admin/scheduler role
    const membershipId = `${userId}_${churchId}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
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
      const header = "Song Title,CCLI Number,Service Date,Service Name,Key Used";
      const rows = records.map((r) =>
        [
          csvEscape(r.song_title),
          r.ccli_number ?? "",
          r.service_date,
          csvEscape(r.service_name),
          r.key_used ?? "",
        ].join(","),
      );

      const csv = [header, ...rows].join("\n");
      const dateLabel = from && to ? `${from}_to_${to}` : "all";

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
