import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isPlatformAdmin } from "@/lib/utils/platform-admin";
import { activeRiskBadges } from "@/lib/server/org-snapshot";
import type { SubscriptionTier } from "@/lib/types";
import type {
  OrgListRow,
  OrgSnapshot,
  OrgStatus,
} from "@/lib/types/platform";

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
    const statusFilter = req.nextUrl.searchParams.get("status") || "";
    const checkinFilter = req.nextUrl.searchParams.get("has_checkin") || "";
    const sort = req.nextUrl.searchParams.get("sort") || "created_at";

    const [churchesSnap, platformOrgsSnap] = await Promise.all([
      adminDb.collection("churches").get(),
      adminDb.collection("platform_orgs").get(),
    ]);

    const snapshotById = new Map<string, OrgSnapshot>();
    for (const d of platformOrgsSnap.docs) {
      snapshotById.set(d.id, d.data() as OrgSnapshot);
    }

    let orgs: OrgListRow[] = churchesSnap.docs.map((doc) => {
      const data = doc.data();
      const snap = snapshotById.get(doc.id);
      const base: OrgListRow = {
        id: doc.id,
        name: (data.name as string) || "",
        slug: (data.slug as string) || "",
        tier: (data.subscription_tier as SubscriptionTier) || "free",
        subscription_source: (data.subscription_source as string) || "stripe",
        created_at: (data.created_at as string) || "",
      };
      if (snap) {
        base.last_active_at = snap.last_active_at;
        base.status = snap.status;
        base.member_count = snap.memberships.total_active;
        base.member_breakdown = snap.memberships;
        base.has_checkin = snap.configuration.has_checkin_settings;
        base.kiosk_count = snap.counts.printers;
        base.children_count = snap.children_presence.children;
        base.sessions_7d = snap.children_presence.sessions_7d;
        base.risk_badges = activeRiskBadges(snap);
      }
      return base;
    });

    // Filters
    if (search) {
      orgs = orgs.filter(
        (o) =>
          o.name.toLowerCase().includes(search) ||
          o.slug.toLowerCase().includes(search),
      );
    }
    if (tierFilter) {
      orgs = orgs.filter((o) => o.tier === tierFilter);
    }
    if (statusFilter) {
      orgs = orgs.filter((o) => (o.status ?? "active") === (statusFilter as OrgStatus));
    }
    if (checkinFilter === "yes") {
      orgs = orgs.filter((o) => o.has_checkin === true);
    } else if (checkinFilter === "no") {
      orgs = orgs.filter((o) => o.has_checkin !== true);
    }

    // Sort
    const cmp = (a: string | null | undefined, b: string | null | undefined) => {
      const aV = a ?? "";
      const bV = b ?? "";
      return aV < bV ? 1 : aV > bV ? -1 : 0;
    };
    if (sort === "last_active") {
      orgs.sort((a, b) => cmp(a.last_active_at ?? null, b.last_active_at ?? null));
    } else if (sort === "person_count") {
      orgs.sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0));
    } else if (sort === "sessions_7d") {
      orgs.sort((a, b) => (b.sessions_7d ?? 0) - (a.sessions_7d ?? 0));
    } else {
      // default: created_at desc
      orgs.sort((a, b) => cmp(a.created_at, b.created_at));
    }

    return NextResponse.json({ orgs });
  } catch (error) {
    console.error("[GET /api/platform/orgs]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
