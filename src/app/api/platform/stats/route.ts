import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isPlatformAdmin } from "@/lib/utils/platform-admin";
import { TIER_LIMITS } from "@/lib/constants";
import type { SubscriptionTier } from "@/lib/types";

interface PlatformStats {
  total_orgs: number;
  new_orgs_30d: number;
  new_orgs_60d: number;
  new_orgs_90d: number;
  tier_distribution: Record<SubscriptionTier, number>;
  total_people: number;
  total_volunteers: number;
  new_people_30d: number;
  new_people_60d: number;
  new_people_90d: number;
  total_assignments: number;
  total_feedback: number;
  open_platform_feedback: number;
  feature_adoption: {
    worship_enabled: number;
    checkin_enabled: number;
    rooms_enabled: number;
  };
  computed_at: string;
}

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

    const statsDoc = await adminDb.doc("platform/stats").get();
    const stats = statsDoc.exists ? (statsDoc.data() as PlatformStats) : null;

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("[GET /api/platform/stats]", error);
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

      // Count people/volunteers from subcollections
      const peopleSnap = await adminDb
        .collection("churches")
        .doc(churchDoc.id)
        .collection("people")
        .get();

      if (peopleSnap.size > 0) {
        totalVolunteers += peopleSnap.size;
        for (const personDoc of peopleSnap.docs) {
          const pData = personDoc.data();
          const pCreated = (pData.created_at as string) || "";
          if (pCreated >= d30) newPeople30d++;
          if (pCreated >= d60) newPeople60d++;
          if (pCreated >= d90) newPeople90d++;
        }
      } else {
        // Fall back to volunteers subcollection
        const volSnap = await adminDb
          .collection("churches")
          .doc(churchDoc.id)
          .collection("volunteers")
          .get();
        totalVolunteers += volSnap.size;
        for (const volDoc of volSnap.docs) {
          const vData = volDoc.data();
          const vCreated = (vData.created_at as string) || "";
          if (vCreated >= d30) newPeople30d++;
          if (vCreated >= d60) newPeople60d++;
          if (vCreated >= d90) newPeople90d++;
        }
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
      computed_at: now.toISOString(),
    };

    // Persist to Firestore
    await adminDb.doc("platform/stats").set(stats);

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("[POST /api/platform/stats]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
