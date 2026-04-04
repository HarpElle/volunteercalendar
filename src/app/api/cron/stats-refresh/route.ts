import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { safeCompare } from "@/lib/utils/safe-compare";

/**
 * GET /api/cron/stats-refresh
 *
 * Recalculates volunteer stats (times_scheduled_last_90d, last_served_date)
 * from assignment data for every church. Runs daily via Vercel cron.
 * Auth: CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || !safeCompare(secret, process.env.CRON_SECRET || "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const churchesSnap = await adminDb.collection("churches").get();
    let totalUpdated = 0;
    const errors: string[] = [];

    for (const churchDoc of churchesSnap.docs) {
      try {
        const churchId = churchDoc.id;
        const churchRef = adminDb.collection("churches").doc(churchId);

        // Determine collection: prefer `people`, fall back to `volunteers`
        const peopleSample = await churchRef.collection("people").limit(1).get();
        const useUnified = !peopleSample.empty;
        const collectionName = useUnified ? "people" : "volunteers";

        // Load volunteers/people
        const volSnap = useUnified
          ? await churchRef.collection("people").where("is_volunteer", "==", true).where("status", "==", "active").get()
          : await churchRef.collection("volunteers").where("status", "==", "active").get();

        if (volSnap.empty) continue;

        // Load all assignments
        const assignSnap = await churchRef.collection("assignments").get();
        const assignments = assignSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Calculate 90-day cutoff
        const now = new Date();
        const ninetyDaysAgo = new Date(now);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const cutoff = ninetyDaysAgo.toISOString().split("T")[0];

        // Build stats per volunteer
        const statsMap = new Map<string, { count: number; lastServed: string | null }>();

        for (const doc of volSnap.docs) {
          statsMap.set(doc.id, { count: 0, lastServed: null });
        }

        for (const a of assignments) {
          const data = a as Record<string, unknown>;
          const personId = (data.person_id || data.volunteer_id) as string;
          const serviceDate = data.service_date as string;
          const status = data.status as string;

          if (!personId || status === "declined") continue;

          const entry = statsMap.get(personId);
          if (!entry) continue;

          // Count within 90-day window
          if (serviceDate >= cutoff) {
            entry.count++;
          }

          // Track latest served date (for non-declined assignments in the past)
          if (serviceDate <= now.toISOString().split("T")[0]) {
            if (!entry.lastServed || serviceDate > entry.lastServed) {
              entry.lastServed = serviceDate;
            }
          }
        }

        // Batch update volunteer stats
        let batch = adminDb.batch();
        let batchCount = 0;

        for (const doc of volSnap.docs) {
          const entry = statsMap.get(doc.id);
          if (!entry) continue;

          const currentStats = doc.data().stats || {};
          const needsUpdate =
            currentStats.times_scheduled_last_90d !== entry.count ||
            currentStats.last_served_date !== entry.lastServed;

          if (needsUpdate) {
            batch.update(doc.ref, {
              "stats.times_scheduled_last_90d": entry.count,
              "stats.last_served_date": entry.lastServed,
              updated_at: now.toISOString(),
            });
            batchCount++;
            totalUpdated++;

            if (batchCount >= 450) {
              await batch.commit();
              batch = adminDb.batch();
              batchCount = 0;
            }
          }
        }

        if (batchCount > 0) {
          await batch.commit();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${churchDoc.id}: ${msg}`);
        console.error(`[stats-refresh] Error for church ${churchDoc.id}:`, err);
      }
    }

    return NextResponse.json({
      churches_processed: churchesSnap.size,
      volunteers_updated: totalUpdated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[stats-refresh] Fatal error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
