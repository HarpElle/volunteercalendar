/**
 * Retention Analytics — core calculations for volunteer health dashboard.
 *
 * All functions are pure: they accept data arrays and return computed metrics.
 * No Firestore access — callers pass in the data they've already loaded.
 */

import type { Assignment, Person } from "@/lib/types";

// ─── Types ────────────────────────────────────────────���───────────────────────

export type BurnoutLevel = "green" | "yellow" | "red";

export interface BurnoutRisk {
  volunteerId: string;
  volunteerName: string;
  level: BurnoutLevel;
  consecutiveWeeks: number;
  /** Max roles per month from their profile */
  maxPerMonth: number;
  /** Actual assignments in last 90 days */
  actualLast90d: number;
}

export interface BenchDepth {
  ministryId: string;
  ministryName: string;
  roleTitle: string;
  qualifiedCount: number;
  weeklySlots: number;
  ratio: number;
  isThin: boolean;
}

export interface ServingFrequency {
  volunteerId: string;
  volunteerName: string;
  count: number;
  preferred: number;
  isOvercommitted: boolean;
}

export interface MinistryDeclineRate {
  ministryId: string;
  ministryName: string;
  total: number;
  declined: number;
  rate: number;
}

export interface GrowthMetrics {
  last30: number;
  last60: number;
  last90: number;
}

export interface RetentionSummary {
  totalActive: number;
  healthyCount: number;
  atRiskCount: number;
  burnoutCount: number;
  inactiveCount: number;
  healthRate: number;
  fairnessScore: number;
  thinBenchCount: number;
  /** True when the org has too little data for meaningful metrics */
  isNewOrg: boolean;
  /** Total assignment count used for data confidence */
  totalAssignments: number;
}

// ─── Burnout Risk ──────────────────���─────────────────────���────────────────────

/**
 * Calculate burnout risk per volunteer based on consecutive weeks served.
 * 3+ consecutive weeks → yellow, 4+ → red.
 */
export function calculateBurnoutRisks(
  volunteers: Person[],
  assignments: Assignment[],
): BurnoutRisk[] {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - 120); // 4-month lookback

  const results: BurnoutRisk[] = [];

  for (const vol of volunteers) {
    const volId = vol.id;
    const volAssignments = assignments.filter(
      (a) =>
        a.person_id === volId &&
        a.status !== "declined" &&
        a.service_date >= windowStart.toISOString().split("T")[0],
    );

    // Group by ISO week
    const weeks = new Set<string>();
    for (const a of volAssignments) {
      const d = new Date(a.service_date);
      // Use Monday-based week: get the Monday of the week
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      weeks.add(monday.toISOString().split("T")[0]);
    }

    // Sort weeks and find max consecutive run
    const sortedWeeks = [...weeks].sort();
    let maxConsecutive = 0;
    let current = 1;

    for (let i = 1; i < sortedWeeks.length; i++) {
      const prev = new Date(sortedWeeks[i - 1]);
      const curr = new Date(sortedWeeks[i]);
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays <= 8) {
        // Allow 1-day flex for week boundaries
        current++;
      } else {
        maxConsecutive = Math.max(maxConsecutive, current);
        current = 1;
      }
    }
    maxConsecutive = Math.max(maxConsecutive, current);

    // Count assignments in last 90 days
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const last90 = assignments.filter(
      (a) =>
        a.person_id === volId &&
        a.status !== "declined" &&
        a.service_date >= ninetyDaysAgo.toISOString().split("T")[0],
    ).length;

    const level: BurnoutLevel =
      maxConsecutive >= 4 ? "red" : maxConsecutive >= 3 ? "yellow" : "green";

    if (level !== "green") {
      results.push({
        volunteerId: volId,
        volunteerName: vol.name,
        level,
        consecutiveWeeks: maxConsecutive,
        maxPerMonth: vol.scheduling_profile?.max_roles_per_month ?? 4,
        actualLast90d: last90,
      });
    }
  }

  // Sort: red first, then yellow
  return results.sort((a, b) => {
    if (a.level === b.level) return b.consecutiveWeeks - a.consecutiveWeeks;
    return a.level === "red" ? -1 : 1;
  });
}

// ─── Bench Depth ──────────────────────��───────────────────────��───────────────

/**
 * Calculate bench depth per ministry/role: ratio of qualified volunteers
 * to weekly slots needed.
 */
export function calculateBenchDepth(
  volunteers: Person[],
  assignments: Assignment[],
  ministries: { id: string; name: string }[],
): BenchDepth[] {
  const results: BenchDepth[] = [];

  // Get unique roles per ministry from recent assignments (last 90 days)
  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const cutoff = ninetyDaysAgo.toISOString().split("T")[0];

  const recentAssignments = assignments.filter((a) => a.service_date >= cutoff);

  // Build role → ministry map
  const rolesByMinistry = new Map<string, Map<string, number>>();
  for (const a of recentAssignments) {
    if (!rolesByMinistry.has(a.ministry_id)) {
      rolesByMinistry.set(a.ministry_id, new Map());
    }
    const roles = rolesByMinistry.get(a.ministry_id)!;
    roles.set(a.role_title, (roles.get(a.role_title) || 0) + 1);
  }

  // Count distinct service dates in last 90 days (to estimate weekly needs)
  const distinctDates = new Set(recentAssignments.map((a) => a.service_date));
  const weekCount = Math.max(1, Math.ceil(distinctDates.size / 1)); // Each date is ~1 week

  const ministryMap = new Map(ministries.map((m) => [m.id, m.name]));

  for (const [ministryId, roles] of rolesByMinistry) {
    // Count qualified volunteers (those assigned to this ministry)
    const qualifiedVols = volunteers.filter(
      (v) => v.ministry_ids.includes(ministryId) && v.status === "active",
    );

    for (const [roleTitle, totalAssignments] of roles) {
      const slotsPerWeek = Math.ceil(totalAssignments / Math.max(weekCount, 1));
      const qualifiedCount = qualifiedVols.length;
      const ratio = slotsPerWeek > 0 ? qualifiedCount / slotsPerWeek : qualifiedCount;

      results.push({
        ministryId,
        ministryName: ministryMap.get(ministryId) || "Unknown",
        roleTitle,
        qualifiedCount,
        weeklySlots: slotsPerWeek,
        ratio: Math.round(ratio * 10) / 10,
        isThin: ratio < 2,
      });
    }
  }

  // Sort: thin benches first
  return results.sort((a, b) => {
    if (a.isThin !== b.isThin) return a.isThin ? -1 : 1;
    return a.ratio - b.ratio;
  });
}

// ─── Serving Frequency ──────────────────���─────────────────────────────────────

/**
 * Serving frequency per volunteer in the last 90 days.
 */
export function calculateServingFrequency(
  volunteers: Person[],
  assignments: Assignment[],
): ServingFrequency[] {
  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const cutoff = ninetyDaysAgo.toISOString().split("T")[0];

  return volunteers.map((vol) => {
    const count = assignments.filter(
      (a) =>
        a.person_id === vol.id &&
        a.status !== "declined" &&
        a.service_date >= cutoff,
    ).length;

    const preferred = vol.scheduling_profile?.preferred_frequency ?? 2;
    // Over 3 months, preferred * 3 would be the expected maximum
    const isOvercommitted = count > preferred * 3;

    return {
      volunteerId: vol.id,
      volunteerName: vol.name,
      count,
      preferred,
      isOvercommitted,
    };
  }).sort((a, b) => b.count - a.count);
}

// ─── Decline Rate ──────────────────────────────────────────────��──────────────

/**
 * Decline rate per ministry.
 */
export function calculateDeclineRates(
  assignments: Assignment[],
  ministries: { id: string; name: string }[],
): MinistryDeclineRate[] {
  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const cutoff = ninetyDaysAgo.toISOString().split("T")[0];

  const recent = assignments.filter((a) => a.service_date >= cutoff);
  const ministryMap = new Map(ministries.map((m) => [m.id, m.name]));

  const byMinistry = new Map<string, { total: number; declined: number }>();
  for (const a of recent) {
    if (!byMinistry.has(a.ministry_id)) {
      byMinistry.set(a.ministry_id, { total: 0, declined: 0 });
    }
    const m = byMinistry.get(a.ministry_id)!;
    m.total++;
    if (a.status === "declined") m.declined++;
  }

  return [...byMinistry.entries()]
    .map(([ministryId, data]) => ({
      ministryId,
      ministryName: ministryMap.get(ministryId) || "Unknown",
      total: data.total,
      declined: data.declined,
      rate: data.total > 0 ? Math.round((data.declined / data.total) * 100) : 0,
    }))
    .sort((a, b) => b.rate - a.rate);
}

// ─── Volunteer Growth ────────────────���────────────────────────────────────────

/**
 * Count volunteers added in the last 30/60/90 days.
 */
export function calculateGrowth(volunteers: Person[]): GrowthMetrics {
  const now = Date.now();
  const day = 1000 * 60 * 60 * 24;

  let last30 = 0;
  let last60 = 0;
  let last90 = 0;

  for (const v of volunteers) {
    if (!v.created_at) continue;
    const created = new Date(v.created_at).getTime();
    const daysAgo = (now - created) / day;
    if (daysAgo <= 30) last30++;
    if (daysAgo <= 60) last60++;
    if (daysAgo <= 90) last90++;
  }

  return { last30, last60, last90 };
}

// ─── Fairness Score ───────────────────���─────────────────��─────────────────────

/**
 * Calculate fairness score (0-1) for assignment distribution.
 * 1.0 = perfectly fair, 0 = highly uneven.
 */
export function calculateFairnessScore(
  volunteers: Person[],
  assignments: Assignment[],
): number {
  if (volunteers.length === 0) return 1;

  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const cutoff = ninetyDaysAgo.toISOString().split("T")[0];

  const counts = new Map<string, number>();
  for (const vol of volunteers) counts.set(vol.id, 0);

  for (const a of assignments) {
    if (a.service_date < cutoff || a.status === "declined") continue;
    const vid = a.person_id;
    if (counts.has(vid)) {
      counts.set(vid, (counts.get(vid) || 0) + 1);
    }
  }

  const totals = [...counts.values()];
  const totalAssignments = totals.reduce((a, b) => a + b, 0);
  const mean = totalAssignments / totals.length;
  // Not enough data to measure fairness meaningfully
  if (mean === 0 || volunteers.length < 3 || totalAssignments < 5) return 1;

  const variance = totals.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / totals.length;
  const stdDev = Math.sqrt(variance);
  return Math.max(0, Math.round((1 - stdDev / Math.max(mean, 1)) * 100) / 100);
}

// ─── Retention Summary ────────────────────────���───────────────────────────────

/**
 * Quick summary for the main dashboard card.
 */
export function calculateRetentionSummary(
  volunteers: Person[],
  assignments: Assignment[],
  ministries: { id: string; name: string }[],
): RetentionSummary {
  const active = volunteers.filter((v) => v.status === "active");
  const isNewOrg = assignments.length < 10;

  // Health classification (same logic as volunteer-health page)
  let healthyCount = 0;
  let atRiskCount = 0;
  let inactiveCount = 0;

  for (const v of active) {
    const stats = v.stats;
    const preferredFrequency = v.scheduling_profile?.preferred_frequency ?? 4;
    if (stats && (stats.no_show_count >= 2 || stats.decline_count >= 3)) {
      atRiskCount++;
    } else if (
      stats &&
      preferredFrequency > 0 &&
      stats.times_scheduled_last_90d > preferredFrequency * 3
    ) {
      atRiskCount++;
    } else if (stats?.last_served_date) {
      const daysSince = Math.floor(
        (Date.now() - new Date(stats.last_served_date).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSince >= 60) {
        inactiveCount++;
      } else {
        healthyCount++;
      }
    } else {
      // No last_served_date: for new orgs, assume healthy (not enough data to judge)
      if (isNewOrg) {
        healthyCount++;
      } else {
        inactiveCount++;
      }
    }
  }

  const burnoutRisks = calculateBurnoutRisks(active, assignments);
  const burnoutCount = burnoutRisks.length;

  const benchDepths = calculateBenchDepth(active, assignments, ministries);
  const thinBenchCount = benchDepths.filter((b) => b.isThin).length;

  const fairnessScore = calculateFairnessScore(active, assignments);

  return {
    totalActive: active.length,
    healthyCount,
    atRiskCount,
    burnoutCount,
    inactiveCount,
    healthRate: active.length > 0 ? Math.round((healthyCount / active.length) * 100) : 100,
    fairnessScore,
    thinBenchCount,
    isNewOrg,
    totalAssignments: assignments.length,
  };
}
