import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { SongUsageRecord } from "@/lib/types";

/**
 * GET /api/reports/song-usage?church_id=xxx&from=2026-01-01&to=2026-03-31&tag=hymn
 * Returns song usage data for CCLI reporting and worship planning.
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

    // Aggregate by song
    const songMap = new Map<
      string,
      {
        song_id: string;
        song_title: string;
        ccli_number: string | null;
        count: number;
        last_used: string;
        services: string[];
      }
    >();

    for (const record of records) {
      const existing = songMap.get(record.song_id);
      if (existing) {
        existing.count++;
        if (record.service_date > existing.last_used) {
          existing.last_used = record.service_date;
        }
        if (!existing.services.includes(record.service_name)) {
          existing.services.push(record.service_name);
        }
      } else {
        songMap.set(record.song_id, {
          song_id: record.song_id,
          song_title: record.song_title,
          ccli_number: record.ccli_number,
          count: 1,
          last_used: record.service_date,
          services: [record.service_name],
        });
      }
    }

    const aggregated = Array.from(songMap.values()).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      records,
      aggregated,
      total_records: records.length,
      unique_songs: aggregated.length,
      date_range: { from: from ?? null, to: to ?? null },
    });
  } catch (error) {
    console.error("[GET /api/reports/song-usage]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
