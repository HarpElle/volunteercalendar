import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireCronSecret } from "@/lib/server/authz";
import { TIER_LIMITS } from "@/lib/constants";
import type { SubscriptionTier, PlatformStats } from "@/lib/types";

export const maxDuration = 300;

/**
 * GET /api/cron/stats-refresh
 *
 * Recalculates volunteer stats (times_scheduled_last_90d, last_served_date)
 * from assignment data for every church. Runs daily via Vercel cron.
 */
export async function GET(req: NextRequest) {
  const blocked = requireCronSecret(req);
  if (blocked) return blocked;

  try {
    const churchesSnap = await adminDb.collection("churches").get();
    let totalUpdated = 0;
    const errors: string[] = [];

    for (const churchDoc of churchesSnap.docs) {
      try {
        const churchId = churchDoc.id;
        const churchRef = adminDb.collection("churches").doc(churchId);

        // Load volunteers from people collection
        const volSnap = await churchRef.collection("people").where("is_volunteer", "==", true).where("status", "==", "active").get();

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
          const personId = data.person_id as string;
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

    // ── Platform Stats Aggregation ───────────────────────────────────────
    try {
      const now = new Date();
      const day = 1000 * 60 * 60 * 24;
      const nowMs = now.getTime();

      const tierDist: Record<string, number> = { free: 0, starter: 0, growth: 0, pro: 0, enterprise: 0 };
      let totalPeople = 0;
      let totalVolunteers = 0;
      let newPeople30 = 0, newPeople60 = 0, newPeople90 = 0;
      let newOrgs30 = 0, newOrgs60 = 0, newOrgs90 = 0;
      let featureWorship = 0, featureCheckin = 0, featureRooms = 0;

      for (const churchDoc of churchesSnap.docs) {
        const data = churchDoc.data();
        const tier = (data.subscription_tier as SubscriptionTier) || "free";
        tierDist[tier] = (tierDist[tier] || 0) + 1;

        // People count
        const pCount = (data.person_count as number) || 0;
        totalPeople += pCount;

        // New org windows
        const createdAt = data.created_at as string | undefined;
        if (createdAt) {
          const daysAgo = (nowMs - new Date(createdAt).getTime()) / day;
          if (daysAgo <= 30) newOrgs30++;
          if (daysAgo <= 60) newOrgs60++;
          if (daysAgo <= 90) newOrgs90++;
        }

        // Feature adoption
        const limits = TIER_LIMITS[tier];
        if (limits?.worship_enabled) featureWorship++;
        if (limits?.checkin_enabled) featureCheckin++;
        if (limits?.rooms_enabled) featureRooms++;
      }

      // Count volunteers and new people across all churches
      for (const churchDoc of churchesSnap.docs) {
        try {
          const churchRef = adminDb.collection("churches").doc(churchDoc.id);
          const snap = await churchRef.collection("people").where("is_volunteer", "==", true).get();

          totalVolunteers += snap.size;

          for (const doc of snap.docs) {
            const d = doc.data();
            const ca = d.created_at as string | undefined;
            if (ca) {
              const daysAgo = (nowMs - new Date(ca).getTime()) / day;
              if (daysAgo <= 30) newPeople30++;
              if (daysAgo <= 60) newPeople60++;
              if (daysAgo <= 90) newPeople90++;
            }
          }
        } catch { /* skip this church for people counts */ }
      }

      // Assignment and feedback counts via collection group
      const [assignSnap, feedbackSnap] = await Promise.all([
        adminDb.collectionGroup("assignments").count().get(),
        adminDb.collectionGroup("feedback").count().get(),
      ]);
      const totalAssignments = assignSnap.data().count;
      const totalFeedback = feedbackSnap.data().count;

      // Open platform feedback count
      const platformFbSnap = await adminDb
        .collectionGroup("feedback")
        .where("platform_feedback", "==", true)
        .get();
      const openPlatformFeedback = platformFbSnap.docs.filter((d) => {
        const status = d.data().status as string;
        return !["resolved", "wont_do", "duplicate"].includes(status);
      }).length;

      const platformStats: PlatformStats = {
        total_orgs: churchesSnap.size,
        new_orgs_30d: newOrgs30,
        new_orgs_60d: newOrgs60,
        new_orgs_90d: newOrgs90,
        tier_distribution: tierDist as Record<SubscriptionTier, number>,
        total_people: totalPeople,
        total_volunteers: totalVolunteers,
        new_people_30d: newPeople30,
        new_people_60d: newPeople60,
        new_people_90d: newPeople90,
        total_assignments: totalAssignments,
        total_feedback: totalFeedback,
        open_platform_feedback: openPlatformFeedback,
        feature_adoption: {
          worship_enabled: featureWorship,
          checkin_enabled: featureCheckin,
          rooms_enabled: featureRooms,
        },
        computed_at: now.toISOString(),
      };

      await adminDb.doc("platform/stats").set(platformStats);
    } catch (platformErr) {
      console.error("[stats-refresh] Platform stats error:", platformErr);
      errors.push(`platform_stats: ${platformErr instanceof Error ? platformErr.message : String(platformErr)}`);
    }

    return NextResponse.json({
      churches_processed: churchesSnap.size,
      volunteers_updated: totalUpdated,
      platform_stats_computed: true,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[stats-refresh] Fatal error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
