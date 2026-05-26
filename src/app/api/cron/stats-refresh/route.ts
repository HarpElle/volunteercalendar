import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireCronSecret } from "@/lib/server/authz";
import { TIER_LIMITS } from "@/lib/constants";
import {
  buildOrgSnapshot,
  buildRecentActivity,
  computeMarketingRollup,
} from "@/lib/server/org-snapshot";
import type { SubscriptionTier, PlatformStats } from "@/lib/types";
import type { OrgSnapshot } from "@/lib/types/platform";
import { log } from "@/lib/log";
import { withCronRun } from "@/lib/server/cron-runs";

export const maxDuration = 300;

/**
 * GET /api/cron/stats-refresh
 *
 * Nightly daily-at-5-AM-UTC cron. Does three jobs in one pass over every
 * church so we only iterate the collection once:
 *
 *   1. Per-volunteer 90-day stats (times_scheduled_last_90d, last_served_date)
 *   2. Per-org snapshot under `platform_orgs/{churchId}` (Wave 0, 2026-05-25 —
 *      previously only the manual /api/platform/stats POST wrote these, so
 *      the platform admin list view showed stale dormant pills for any org
 *      where nobody had clicked Refresh recently). Calls
 *      buildOrgSnapshot(churchId, true) so admin/scheduler sign-in times
 *      land in the snapshot's activity signal.
 *   3. Aggregate `platform/stats` doc + `platform/recent_activity` rollup
 *
 * Why one cron instead of three: keeps one nightly schedule under one set
 * of telemetry + cron_runs tracking (Wave 2). The previous two-path design
 * (cron updated stats + manual POST updated snapshots) had the failure
 * mode "Jason hasn't clicked Refresh in 3 weeks → snapshots stale forever."
 */
export async function GET(req: NextRequest) {
  const blocked = requireCronSecret(req);
  if (blocked) return blocked;

  try {
    const { response } = await withCronRun("stats-refresh", async () => {
    const churchesSnap = await adminDb.collection("churches").get();
    let totalUpdated = 0;
    let totalSnapshotsWritten = 0;
    let platformStatsOk = false;
    const errors: string[] = [];
    // Wave 0: collect every successful snapshot so we can compute the
    // platform/recent_activity rollup at the end. Pushed by processChurch.
    const snapshots: OrgSnapshot[] = [];

    // Track E.3: process churches in concurrent batches of 5 instead of
    // sequentially. At 100 churches × ~2s each, sequential = 200s (over the
    // Vercel timeout). Concurrent = ~40s with the same per-church cost.
    // Wave 0: adding buildOrgSnapshot(id, true) per church adds ~2s of work
    // per church (membership read + admin auth batch + service/event counts).
    // 100 churches × ~4s each / 5 concurrency = ~80s — still well inside 300s.
    const CONCURRENCY = 5;
    async function processChurch(churchDoc: FirebaseFirestore.QueryDocumentSnapshot) {
      try {
        const churchId = churchDoc.id;
        const churchRef = adminDb.collection("churches").doc(churchId);

        // Load volunteers from people collection
        const volSnap = await churchRef.collection("people").where("is_volunteer", "==", true).where("status", "==", "active").get();

        if (volSnap.empty) return;

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

        // Wave 0: build + write per-org snapshot. Wrapped in its own
        // try/catch so a snapshot failure (e.g. transient Firebase Auth
        // error during the admin sign-in batch fetch) doesn't roll back
        // the volunteer-stats batch we already committed above.
        try {
          const snapshot = await buildOrgSnapshot(churchId, true);
          if (snapshot) {
            await adminDb
              .doc(`platform_orgs/${churchId}`)
              .set(snapshot);
            snapshots.push(snapshot);
            totalSnapshotsWritten++;
          }
        } catch (snapErr) {
          const msg =
            snapErr instanceof Error ? snapErr.message : String(snapErr);
          errors.push(`${churchDoc.id} snapshot: ${msg}`);
          log.error("stats-refresh snapshot failed for church", {
            error: snapErr,
            church_id: churchDoc.id,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${churchDoc.id}: ${msg}`);
        log.error("stats-refresh per-church processing failed", {
          error: err,
          church_id: churchDoc.id,
        });
      }
    }

    // Concurrent processing: chunk by CONCURRENCY, await each chunk before
    // starting the next. Bounded parallelism = no thundering-herd on Firestore.
    for (let i = 0; i < churchesSnap.docs.length; i += CONCURRENCY) {
      const chunk = churchesSnap.docs.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(processChurch));
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

      // Assignment count via collection group .count() (no docs returned)
      const assignSnap = await adminDb
        .collectionGroup("assignments")
        .count()
        .get();
      const totalAssignments = assignSnap.data().count;

      // Feedback: fetch all docs and filter in JS. Wave 0 hotfix round 2
      // (Codex 2026-05-26): previously this used
      // `.where("platform_feedback", "==", true)` which needs a Firestore
      // collection-group single-field index on feedback.platform_feedback.
      // Production didn't have the index so the whole platform-stats
      // block 9-FAILED_PRECONDITION'd, leaving the marketing rollup
      // stale on the cron path even though the manual /api/platform/stats
      // POST endpoint worked fine (it filters in JS). Aligns both paths
      // on the same query shape — no index dependency. Avoids the
      // recurring drift class of bug that's bitten Wave 0 twice now.
      const feedbackSnap = await adminDb
        .collectionGroup("feedback")
        .get();
      const totalFeedback = feedbackSnap.size;
      const openPlatformFeedback = feedbackSnap.docs.filter((d) => {
        const data = d.data();
        if (data.platform_feedback !== true) return false;
        const status = data.status as string;
        return !["resolved", "wont_do", "duplicate"].includes(status);
      }).length;

      // Wave 0: marketing-friendly rollups (shared helper so cron + manual
      // POST endpoint stay in sync — Codex hotfix retest 2026-05-25).
      const marketing = computeMarketingRollup(snapshots);

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
        marketing,
        computed_at: now.toISOString(),
      };

      await adminDb.doc("platform/stats").set(platformStats);
      // Wave 0 hotfix round 2: only flip the success flag AFTER the
      // platform/stats write lands. Previously the response always
      // claimed `platform_stats_computed: true` regardless of whether
      // the inner try threw — Codex caught this when the missing
      // feedback index made the block 9-FAILED_PRECONDITION but the
      // cron response still reported success.
      platformStatsOk = true;

      // Wave 0: persist the recent-activity rollup (most_active, dormant,
      // at_risk). Previously only the manual /api/platform/stats POST
      // did this; now the cron does it so the platform admin's "Recent
      // Activity" panel stays fresh without anyone clicking Refresh.
      try {
        const recentActivity = buildRecentActivity(snapshots);
        await adminDb.doc("platform/recent_activity").set(recentActivity);
      } catch (raErr) {
        log.error("stats-refresh recent_activity write failed", { error: raErr });
        errors.push(
          `recent_activity: ${raErr instanceof Error ? raErr.message : String(raErr)}`,
        );
      }
    } catch (platformErr) {
      log.error("stats-refresh platform stats write failed", { error: platformErr });
      errors.push(`platform_stats: ${platformErr instanceof Error ? platformErr.message : String(platformErr)}`);
    }

      return {
        response: NextResponse.json({
          churches_processed: churchesSnap.size,
          volunteers_updated: totalUpdated,
          snapshots_written: totalSnapshotsWritten,
          platform_stats_computed: platformStatsOk,
          errors: errors.length > 0 ? errors : undefined,
        }),
        summary: {
          processed: churchesSnap.size,
          failed: errors.length,
          metadata: {
            volunteers_updated: totalUpdated,
            snapshots_written: totalSnapshotsWritten,
            platform_stats_computed: platformStatsOk,
          },
        },
      };
    });
    return response;
  } catch (err) {
    log.error("stats-refresh fatal error", { error: err });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
