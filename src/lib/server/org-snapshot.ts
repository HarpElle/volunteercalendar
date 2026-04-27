/**
 * Per-organization snapshot computation for the platform admin views.
 *
 * Used by:
 *   - POST /api/platform/stats (writes a snapshot for every church)
 *   - POST /api/platform/orgs/[id]/recompute (single-org refresh)
 *   - GET  /api/platform/orgs/[id] (live recompute, reads owner sign-in time)
 */

import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { TIER_LIMITS } from "@/lib/constants";
import type {
  Membership,
  OrgRole,
  SubscriptionTier,
} from "@/lib/types";
import type {
  OrgChildrenPresence,
  OrgConfigurationCounts,
  OrgConfigurationFlags,
  OrgMembershipBreakdown,
  OrgOwner,
  OrgRiskSignals,
  OrgSnapshot,
  OrgStatus,
  RecentActivity,
  RecentActivityRow,
} from "@/lib/types/platform";

const DAY_MS = 24 * 60 * 60 * 1000;
const ABANDONED_SIGNUP_DAYS = 7;

/**
 * Build a snapshot for a single church.
 *
 * @param churchId    The doc ID of the church.
 * @param includeOwnerLastSignIn  If true, fetches `lastSignInTime` from
 *   Firebase Auth (1 extra round-trip). Skip during bulk recompute to keep
 *   the cron under timeout; the per-org detail view sets this true.
 */
export async function buildOrgSnapshot(
  churchId: string,
  includeOwnerLastSignIn: boolean = false,
): Promise<OrgSnapshot | null> {
  const churchRef = adminDb.collection("churches").doc(churchId);
  const churchSnap = await churchRef.get();
  if (!churchSnap.exists) return null;
  const church = churchSnap.data()!;

  const tier = (church.subscription_tier as SubscriptionTier) || "free";
  const now = new Date();
  const nowIso = now.toISOString();
  const d24Iso = new Date(now.getTime() - DAY_MS).toISOString();
  const d7Iso = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const d30Iso = new Date(now.getTime() - 30 * DAY_MS).toISOString();

  // ── Parallel reads ────────────────────────────────────────────────────────
  const [
    memberships,
    services,
    servicePlans,
    ministries,
    rooms,
    shortLinks,
    calendarFeeds,
    checkinSettingsDoc,
    checkinRooms,
    children,
    householdsLegacy,
    sessions7d,
    sessions24h,
    sessionsTotal,
    recentAssignments,
    recentSessionsForSparkline,
    facilityGroupMembership,
  ] = await Promise.all([
    adminDb.collection("memberships").where("church_id", "==", churchId).get(),
    churchRef.collection("services").count().get(),
    churchRef.collection("service_plans").count().get(),
    churchRef.collection("ministries").count().get(),
    churchRef.collection("rooms").count().get(),
    adminDb.collection("short_links").where("church_id", "==", churchId).count().get(),
    churchRef.collection("calendar_feeds").count().get(),
    churchRef.collection("checkinSettings").doc("config").get(),
    churchRef.collection("checkinRooms").count().get(),
    churchRef.collection("children").count().get(),
    churchRef.collection("checkin_households").count().get(),
    churchRef
      .collection("checkInSessions")
      .where("checked_in_at", ">=", d7Iso)
      .get(),
    churchRef
      .collection("checkInSessions")
      .where("checked_in_at", ">=", d24Iso)
      .count()
      .get(),
    churchRef.collection("checkInSessions").count().get(),
    // For activity timestamps + sparkline (last 30d)
    churchRef
      .collection("assignments")
      .where("updated_at", ">=", d30Iso)
      .orderBy("updated_at", "desc")
      .limit(1000)
      .get()
      .catch(() => null),
    churchRef
      .collection("checkInSessions")
      .where("checked_in_at", ">=", d30Iso)
      .orderBy("checked_in_at", "desc")
      .limit(2000)
      .get()
      .catch(() => null),
    adminDb
      .collectionGroup("members")
      .where("church_id", "==", churchId)
      .limit(1)
      .get()
      .catch(() => null),
  ]);

  // ── Membership breakdown ──────────────────────────────────────────────────
  const breakdown: OrgMembershipBreakdown = {
    owner: 0,
    admin: 0,
    scheduler: 0,
    volunteer: 0,
    pending_invite: 0,
    pending_self_join: 0,
    inactive: 0,
    total_active: 0,
  };

  let mostRecentMemberAdded: string | null = null as string | null;
  const owners: Membership[] = [];
  const memberDocs = memberships.docs.map((d) => d.data() as Membership);

  for (const m of memberDocs) {
    if (m.status === "pending_volunteer_approval") {
      breakdown.pending_invite++;
    } else if (m.status === "pending_org_approval") {
      breakdown.pending_self_join++;
    } else if (m.status === "inactive") {
      breakdown.inactive++;
    } else if (m.status === "active") {
      const role = (m.role as OrgRole) || "volunteer";
      if (role === "owner") {
        breakdown.owner++;
        owners.push(m);
      } else if (role === "admin") {
        breakdown.admin++;
      } else if (role === "scheduler") {
        breakdown.scheduler++;
      } else {
        breakdown.volunteer++;
      }
      breakdown.total_active++;
    }

    // We don't have a single created_at on Membership reliably across
    // the legacy/new schema, but invited_by + status transitions imply a
    // created moment via the doc's create time. Fall back to undefined.
  }

  // ── Owner identity ────────────────────────────────────────────────────────
  const owner: OrgOwner = {
    uid: null,
    email: null,
    display_name: null,
    last_sign_in_at: null,
  };

  // Prefer explicit owner; fall back to the church doc's `created_by` if set.
  const ownerUid =
    owners[0]?.user_id ??
    (church.created_by as string | undefined) ??
    null;

  if (ownerUid) {
    owner.uid = ownerUid;
    // Always pull the user profile for email/display_name
    const userSnap = await adminDb.collection("users").doc(ownerUid).get();
    if (userSnap.exists) {
      const u = userSnap.data()!;
      owner.email = (u.email as string) ?? null;
      owner.display_name = (u.display_name as string) ?? null;
    }
    if (includeOwnerLastSignIn) {
      try {
        const authUser = await adminAuth.getUser(ownerUid);
        owner.last_sign_in_at =
          authUser.metadata.lastSignInTime
            ? new Date(authUser.metadata.lastSignInTime).toISOString()
            : null;
      } catch {
        // ignore — auth user may not exist for orphaned memberships
      }
    }
  }

  // ── Configuration flags + counts ──────────────────────────────────────────
  const checkinSettings = checkinSettingsDoc.exists
    ? checkinSettingsDoc.data() ?? {}
    : null;
  const printers = Array.isArray(checkinSettings?.printers)
    ? (checkinSettings!.printers as unknown[]).length
    : 0;
  const counts: OrgConfigurationCounts = {
    services: services.data().count,
    service_plans: servicePlans.data().count,
    ministries: ministries.data().count,
    rooms: rooms.data().count,
    short_links: shortLinks.data().count,
    calendar_feeds: calendarFeeds.data().count,
    printers,
    checkin_rooms: checkinRooms.data().count,
  };
  const configuration: OrgConfigurationFlags = {
    has_services: counts.services > 0,
    has_checkin_settings: checkinSettings !== null,
    has_kiosks: printers > 0,
    has_worship_plans: counts.service_plans > 0,
    has_rooms: counts.rooms > 0,
    has_calendar_feeds: counts.calendar_feeds > 0,
    has_short_links: counts.short_links > 0,
    has_facility_groups: !!facilityGroupMembership && !facilityGroupMembership.empty,
  };

  // ── Children's-data presence ──────────────────────────────────────────────
  const childrenCount = children.data().count;
  const householdsCount = householdsLegacy.data().count;
  // Detect any medical notes by scanning a small sample (cheap; if any have
  // medical_notes/allergies we set the flag without surfacing values).
  let anyMedicalNotes = false;
  if (childrenCount > 0) {
    const sample = await churchRef.collection("children").limit(50).get();
    for (const d of sample.docs) {
      const data = d.data();
      if (
        (typeof data.allergies === "string" && data.allergies.trim().length > 0) ||
        (typeof data.medical_notes === "string" &&
          data.medical_notes.trim().length > 0)
      ) {
        anyMedicalNotes = true;
        break;
      }
    }
  }
  const childrenPresence: OrgChildrenPresence = {
    children: childrenCount,
    households: householdsCount,
    sessions_total: sessionsTotal.data().count,
    sessions_24h: sessions24h.data().count,
    sessions_7d: sessions7d.size,
    any_medical_notes_set: anyMedicalNotes,
  };

  // ── Activity signal ───────────────────────────────────────────────────────
  let lastActiveAt: string | null = null;
  const bumpActive = (iso: string | null | undefined) => {
    if (iso && (!lastActiveAt || iso > lastActiveAt)) lastActiveAt = iso;
  };

  if (recentAssignments && !recentAssignments.empty) {
    bumpActive(recentAssignments.docs[0].data().updated_at as string);
  }
  if (!sessions7d.empty) {
    bumpActive(sessions7d.docs[0].data().checked_in_at as string);
  }
  // Most recent member added (using whatever timestamp we have on the doc)
  for (const m of memberDocs) {
    const ts =
      ((m as unknown) as { created_at?: string; updated_at?: string }).updated_at ??
      ((m as unknown) as { created_at?: string }).created_at;
    if (ts) bumpActive(ts);
    if (ts && (!mostRecentMemberAdded || ts > mostRecentMemberAdded)) {
      mostRecentMemberAdded = ts;
    }
  }
  bumpActive(owner.last_sign_in_at);
  bumpActive((church.updated_at as string) ?? null);
  bumpActive((church.created_at as string) ?? null);

  // ── Sparklines (30 buckets, oldest→newest) ────────────────────────────────
  const sessionsByDay = new Array<number>(30).fill(0);
  const assignmentsByDay = new Array<number>(30).fill(0);
  const membersAddedByDay = new Array<number>(30).fill(0);
  const dayIndex = (iso: string): number => {
    const t = new Date(iso).getTime();
    const diffDays = Math.floor((now.getTime() - t) / DAY_MS);
    if (diffDays < 0 || diffDays >= 30) return -1;
    return 29 - diffDays; // oldest first
  };
  if (recentSessionsForSparkline) {
    for (const d of recentSessionsForSparkline.docs) {
      const i = dayIndex((d.data().checked_in_at as string) ?? "");
      if (i >= 0) sessionsByDay[i]++;
    }
  }
  if (recentAssignments) {
    for (const d of recentAssignments.docs) {
      const i = dayIndex((d.data().updated_at as string) ?? "");
      if (i >= 0) assignmentsByDay[i]++;
    }
  }
  for (const m of memberDocs) {
    const ts = ((m as unknown) as { created_at?: string }).created_at;
    if (ts) {
      const i = dayIndex(ts);
      if (i >= 0) membersAddedByDay[i]++;
    }
  }

  // ── Risk signals ──────────────────────────────────────────────────────────
  const ageMs = church.created_at
    ? now.getTime() - new Date(church.created_at as string).getTime()
    : Infinity;
  const lastActiveMs = lastActiveAt
    ? now.getTime() - new Date(lastActiveAt).getTime()
    : Infinity;

  const limits = TIER_LIMITS[tier];
  // "Free tier paid feature attempted" = tier doesn't have check-in BUT they've
  // configured check-in settings or have kids/sessions present.
  const tierForbidsCheckin = !!limits && !limits.checkin_enabled;
  const hasCheckinPresence =
    configuration.has_checkin_settings ||
    childrenPresence.children > 0 ||
    childrenPresence.sessions_total > 0;

  const risk: OrgRiskSignals = {
    dormant_14d: lastActiveMs > 14 * DAY_MS,
    dormant_30d: lastActiveMs > 30 * DAY_MS,
    dormant_60d: lastActiveMs > 60 * DAY_MS,
    free_tier_paid_feature_attempted: tierForbidsCheckin && hasCheckinPresence,
    payment_failed: false, // Track C
    subscription_past_due: false, // Track C
    abandoned_signup:
      ageMs <= ABANDONED_SIGNUP_DAYS * DAY_MS &&
      lastActiveMs > 24 * 60 * 60 * 1000 * 2, // no activity past first 2 days of an account < 7d old
  };

  // ── Status pill ───────────────────────────────────────────────────────────
  const status: OrgStatus = (() => {
    if (
      risk.payment_failed ||
      risk.subscription_past_due ||
      risk.free_tier_paid_feature_attempted
    ) {
      return "at_risk";
    }
    if (risk.abandoned_signup) return "abandoned_signup";
    if (risk.dormant_30d) return "dormant_30d";
    if (risk.dormant_14d) return "dormant_14d";
    return "active";
  })();

  return {
    id: churchId,
    name: (church.name as string) || "",
    slug: (church.slug as string) || "",
    tier,
    subscription_source: (church.subscription_source as string) || "stripe",
    created_at: (church.created_at as string) || "",
    last_active_at: lastActiveAt,
    status,
    owner,
    memberships: breakdown,
    configuration,
    counts,
    children_presence: childrenPresence,
    risk,
    recent_activity: {
      sessions_by_day: sessionsByDay,
      assignments_by_day: assignmentsByDay,
      members_added_by_day: membersAddedByDay,
    },
    computed_at: nowIso,
  };
}

/** Build a short human-readable activity signal for a snapshot row. */
export function describeSignal(s: OrgSnapshot): string {
  const parts: string[] = [];
  if (s.children_presence.sessions_7d > 0) {
    parts.push(`${s.children_presence.sessions_7d} check-in${s.children_presence.sessions_7d === 1 ? "" : "s"} (7d)`);
  }
  const recentAssignments = s.recent_activity.assignments_by_day
    .slice(-7)
    .reduce((a, b) => a + b, 0);
  if (recentAssignments > 0) {
    parts.push(`${recentAssignments} schedule update${recentAssignments === 1 ? "" : "s"}`);
  }
  const recentMembers = s.recent_activity.members_added_by_day
    .slice(-7)
    .reduce((a, b) => a + b, 0);
  if (recentMembers > 0) {
    parts.push(`${recentMembers} new member${recentMembers === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) {
    if (s.memberships.total_active === 0) return "No members yet";
    return "No recent activity";
  }
  return parts.join(", ");
}

/** Risk badges to highlight in UI rows. */
export function activeRiskBadges(s: OrgSnapshot): Array<keyof OrgRiskSignals> {
  return (Object.entries(s.risk) as Array<[keyof OrgRiskSignals, boolean]>)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

/** Build the recent_activity rollup from an array of snapshots. */
export function buildRecentActivity(snapshots: OrgSnapshot[]): RecentActivity {
  const toRow = (s: OrgSnapshot): RecentActivityRow => ({
    id: s.id,
    name: s.name,
    tier: s.tier,
    last_active_at: s.last_active_at,
    status: s.status,
    signal: describeSignal(s),
    risk_badges: activeRiskBadges(s),
  });

  const withActivity = snapshots.filter((s) => s.last_active_at !== null);

  const mostActive = [...withActivity]
    .sort((a, b) => (b.last_active_at! > a.last_active_at! ? 1 : -1))
    .slice(0, 5)
    .map(toRow);

  const dormant = snapshots
    .filter((s) => s.risk.dormant_14d)
    .sort((a, b) => {
      const aT = a.last_active_at ?? a.created_at;
      const bT = b.last_active_at ?? b.created_at;
      return aT < bT ? -1 : 1; // oldest-stale first
    })
    .slice(0, 5)
    .map(toRow);

  const atRisk = snapshots
    .filter((s) => s.status === "at_risk" || s.status === "abandoned_signup")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 10)
    .map(toRow);

  return {
    most_active: mostActive,
    dormant,
    at_risk: atRisk,
    computed_at: new Date().toISOString(),
  };
}
