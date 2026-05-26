import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isPlatformAdmin } from "@/lib/utils/platform-admin";
import { TIER_LIMITS } from "@/lib/constants";
import {
  buildOrgSnapshot,
  buildRecentActivity,
  computeMarketingRollup,
} from "@/lib/server/org-snapshot";
import type { SubscriptionTier, PlatformStats } from "@/lib/types";
import type { OrgSnapshot } from "@/lib/types/platform";
import { log } from "@/lib/log";

// Wave 0 hotfix (Codex retest 2026-05-25): import PlatformStats from
// @/lib/types instead of redefining locally. The local interface was
// missing the `marketing` field added to the global type in Wave 0,
// which is precisely why the manual refresh path silently shipped
// without it. Same drift class of bug Codex caught in the rollup
// computation itself.

const VALID_TIERS: SubscriptionTier[] = [
  "free",
  "starter",
  "growth",
  "pro",
  "enterprise",
];

// ─── GET ──────────────────────────────────────────────────────────────────────

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

    const [statsDoc, recentDoc] = await Promise.all([
      adminDb.doc("platform/stats").get(),
      adminDb.doc("platform/recent_activity").get(),
    ]);
    const stats = statsDoc.exists ? (statsDoc.data() as PlatformStats) : null;
    const recent_activity = recentDoc.exists ? recentDoc.data() : null;

    return NextResponse.json({ stats, recent_activity });
  } catch (error) {
    log.error("GET /api/platform/stats failed", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    if (!isPlatformAdmin(decoded.uid)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const d60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Load all churches
    const churchesSnap = await adminDb.collection("churches").get();

    const tierDistribution: Record<SubscriptionTier, number> = {
      free: 0,
      starter: 0,
      growth: 0,
      pro: 0,
      enterprise: 0,
    };

    let totalPeople = 0;
    let totalVolunteers = 0;
    let newPeople30d = 0;
    let newPeople60d = 0;
    let newPeople90d = 0;
    let newOrgs30d = 0;
    let newOrgs60d = 0;
    let newOrgs90d = 0;

    const featureAdoption = {
      worship_enabled: 0,
      checkin_enabled: 0,
      rooms_enabled: 0,
    };

    for (const churchDoc of churchesSnap.docs) {
      const data = churchDoc.data();
      const tier = (data.subscription_tier as SubscriptionTier) || "free";
      const createdAt = (data.created_at as string) || "";
      const personCount = (data.person_count as number) || 0;

      // Tier distribution
      if (VALID_TIERS.includes(tier)) {
        tierDistribution[tier]++;
      } else {
        tierDistribution.free++;
      }

      // New orgs by window
      if (createdAt >= d30) newOrgs30d++;
      if (createdAt >= d60) newOrgs60d++;
      if (createdAt >= d90) newOrgs90d++;

      // Denormalized person count
      totalPeople += personCount;

      // Feature adoption based on tier limits
      const limits = TIER_LIMITS[tier];
      if (limits) {
        if (limits.worship_enabled) featureAdoption.worship_enabled++;
        if (limits.checkin_enabled) featureAdoption.checkin_enabled++;
        if (limits.rooms_enabled) featureAdoption.rooms_enabled++;
      }

      // Count volunteers from people collection
      const peopleSnap = await adminDb
        .collection("churches")
        .doc(churchDoc.id)
        .collection("people")
        .where("is_volunteer", "==", true)
        .get();

      totalVolunteers += peopleSnap.size;
      for (const personDoc of peopleSnap.docs) {
        const pData = personDoc.data();
        const pCreated = (pData.created_at as string) || "";
        if (pCreated >= d30) newPeople30d++;
        if (pCreated >= d60) newPeople60d++;
        if (pCreated >= d90) newPeople90d++;
      }
    }

    // Count total assignments across all churches
    const assignmentsSnap = await adminDb.collectionGroup("assignments").get();
    const totalAssignments = assignmentsSnap.size;

    // Count total feedback and open platform feedback
    const feedbackSnap = await adminDb.collectionGroup("feedback").get();
    const totalFeedback = feedbackSnap.size;

    const closedStatuses = ["resolved", "wont_do", "duplicate"];
    let openPlatformFeedback = 0;
    for (const fbDoc of feedbackSnap.docs) {
      const fbData = fbDoc.data();
      if (
        fbData.platform_feedback === true &&
        !closedStatuses.includes(fbData.status as string)
      ) {
        openPlatformFeedback++;
      }
    }

    // ─── Per-org snapshots + recent activity rollup ──────────────────────────
    // Build snapshots for every church FIRST so the marketing rollup
    // below can sum across them. Run with concurrency cap so we don't
    // blast Firestore on a recompute.
    //
    // Wave 0 hotfix (Codex retest 2026-05-25): snapshot build moved
    // ahead of the platform/stats write so the marketing rollup can be
    // computed and included in the stats doc. Previously the stats doc
    // was written first (without marketing), then snapshots were built
    // — leaving the manual refresh path silently missing the field that
    // the dashboard panel keys off.
    const snapshots: OrgSnapshot[] = [];
    const churchIds = churchesSnap.docs.map((d) => d.id);
    const concurrency = 5;
    for (let i = 0; i < churchIds.length; i += concurrency) {
      const batch = churchIds.slice(i, i + concurrency);
      const results = await Promise.all(
        // Wave 0 (2026-05-25): pass `true` so the manual "Refresh Stats"
        // button captures admin/scheduler sign-in times too — matches the
        // nightly cron path. Without this the manual refresh would still
        // produce stale dormant pills for orgs whose only activity is
        // admin logins.
        batch.map((id) =>
          buildOrgSnapshot(id, true).catch((err) => {
            log.error("platform/stats snapshot build failed for church", { error: err, church_id: id });
            return null;
          }),
        ),
      );
      for (const s of results) {
        if (s) snapshots.push(s);
      }
    }

    // Persist each snapshot under platform_orgs/{churchId}
    const writer = adminDb.bulkWriter();
    for (const s of snapshots) {
      writer.set(adminDb.doc(`platform_orgs/${s.id}`), s);
    }
    await writer.close();

    // Wave 0 hotfix: marketing rollup via the shared helper so this
    // path and the cron path can't drift again.
    const marketing = computeMarketingRollup(snapshots);

    const stats: PlatformStats = {
      total_orgs: churchesSnap.size,
      new_orgs_30d: newOrgs30d,
      new_orgs_60d: newOrgs60d,
      new_orgs_90d: newOrgs90d,
      tier_distribution: tierDistribution,
      total_people: totalPeople,
      total_volunteers: totalVolunteers,
      new_people_30d: newPeople30d,
      new_people_60d: newPeople60d,
      new_people_90d: newPeople90d,
      total_assignments: totalAssignments,
      total_feedback: totalFeedback,
      open_platform_feedback: openPlatformFeedback,
      feature_adoption: featureAdoption,
      marketing,
      computed_at: now.toISOString(),
    };

    // Persist aggregate stats (now includes marketing rollup)
    await adminDb.doc("platform/stats").set(stats);

    // Persist the recent-activity rollup
    const recentActivity = buildRecentActivity(snapshots);
    await adminDb.doc("platform/recent_activity").set(recentActivity);

    return NextResponse.json({ stats, snapshots_written: snapshots.length });
  } catch (error) {
    log.error("POST /api/platform/stats failed", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
