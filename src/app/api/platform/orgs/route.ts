import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isPlatformAdmin } from "@/lib/utils/platform-admin";
import type { SubscriptionTier } from "@/lib/types";

interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  tier: SubscriptionTier;
  subscription_source: string;
  person_count: number;
  created_at: string;
}

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

    const search = req.nextUrl.searchParams.get("search")?.toLowerCase() || "";
    const tierFilter = req.nextUrl.searchParams.get("tier") || "";

    const churchesSnap = await adminDb.collection("churches").get();

    let orgs: OrgSummary[] = churchesSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: (data.name as string) || "",
        slug: (data.slug as string) || "",
        tier: (data.subscription_tier as SubscriptionTier) || "free",
        subscription_source: (data.subscription_source as string) || "stripe",
        person_count: (data.person_count as number) || 0,
        created_at: (data.created_at as string) || "",
      };
    });

    // Apply search filter (case-insensitive name/slug match)
    if (search) {
      orgs = orgs.filter(
        (o) =>
          o.name.toLowerCase().includes(search) ||
          o.slug.toLowerCase().includes(search),
      );
    }

    // Apply tier filter
    if (tierFilter) {
      orgs = orgs.filter((o) => o.tier === tierFilter);
    }

    // Sort by created_at descending
    orgs.sort((a, b) => b.created_at.localeCompare(a.created_at));

    return NextResponse.json({ orgs });
  } catch (error) {
    console.error("[GET /api/platform/orgs]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
