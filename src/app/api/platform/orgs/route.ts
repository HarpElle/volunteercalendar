import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requirePlatformAdmin } from "@/lib/server/authz";
import { parseQuery, z } from "@/lib/server/validation";
import { activeRiskBadges } from "@/lib/server/org-snapshot";
import type { SubscriptionTier } from "@/lib/types";
import type {
  OrgListRow,
  OrgSnapshot,
  OrgStatus,
} from "@/lib/types/platform";
import { log } from "@/lib/log";

const ListQuerySchema = z.object({
  search: z.string().optional().default(""),
  tier: z.string().optional().default(""),
  status: z.string().optional().default(""),
  has_checkin: z.string().optional().default(""),
  sort: z.string().optional().default("created_at"),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAdmin(req);
  if (auth instanceof NextResponse) return auth;
  void auth;

  const q = parseQuery(req, ListQuerySchema);
  if (q instanceof NextResponse) return q;

  try {
    const search = q.search.toLowerCase();
    const { tier: tierFilter, status: statusFilter, has_checkin: checkinFilter, sort } = q;

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
    log.error("GET /api/platform/orgs failed", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
