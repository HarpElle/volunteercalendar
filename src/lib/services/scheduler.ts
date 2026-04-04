/**
 * VolunteerCal — Auto-Draft Scheduling Algorithm
 *
 * Hybrid approach: Greedy initial assignment → Conflict detection → Local search for fairness.
 * Constraints: availability, blockouts, frequency caps, household conflicts, ministry membership.
 * Target: <1s for 250 volunteers + 50 services.
 */

import type {
  Volunteer,
  Service,
  ServiceRole,
  Household,
  Ministry,
  Assignment,
  ScheduleConflict,
  SchedulingResult,
  ServiceOccurrence,
  ScheduleStatus,
  OnboardingStep,
} from "@/lib/types";
import { ORG_WIDE_MINISTRY_ID } from "@/lib/types";
import { getServiceMinistries } from "@/lib/utils/service-helpers";

// --- Date Helpers ---

/** Parse a YYYY-MM-DD string as a local-time Date (avoids UTC-offset day shift). */
function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Format a Date as YYYY-MM-DD using local time (not UTC). */
function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Generate all dates a service occurs within a range */
export function generateOccurrences(
  services: Service[],
  startDate: string,
  endDate: string,
): ServiceOccurrence[] {
  const occurrences: ServiceOccurrence[] = [];
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);

  for (const service of services) {
    const current = new Date(start);
    // Advance to first matching day of week
    while (current.getDay() !== service.day_of_week && current <= end) {
      current.setDate(current.getDate() + 1);
    }

    let occurrenceCount = 0;
    while (current <= end) {
      occurrences.push({
        service,
        date: formatLocalDate(current),
      });
      occurrenceCount++;

      switch (service.recurrence) {
        case "weekly":
          current.setDate(current.getDate() + 7);
          break;
        case "biweekly":
          current.setDate(current.getDate() + 14);
          break;
        case "monthly":
          current.setMonth(current.getMonth() + 1);
          // Reset to correct day of week
          while (current.getDay() !== service.day_of_week) {
            current.setDate(current.getDate() + 1);
          }
          break;
        case "custom":
          current.setDate(current.getDate() + 7); // default to weekly for custom
          break;
      }
    }
  }

  // Sort by date, then by service start time
  return occurrences.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.service.start_time.localeCompare(b.service.start_time);
  });
}

// --- Constraint Checking ---

export interface VolunteerAssignmentCount {
  [volunteerId: string]: {
    total: number;
    byDate: Record<string, number>;
    byMonth: Record<string, number>;
  };
}

function isBlockedOut(volunteer: Volunteer, date: string): boolean {
  return volunteer.availability.blockout_dates.some((blockout) => {
    // Support single dates or ranges ("2026-04-01" or "2026-04-01/2026-04-07")
    if (blockout.includes("/")) {
      const [rangeStart, rangeEnd] = blockout.split("/");
      return date >= rangeStart && date <= rangeEnd;
    }
    return date === blockout;
  });
}

function isRecurringUnavailable(volunteer: Volunteer, dayOfWeek: number): boolean {
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return volunteer.availability.recurring_unavailable.some(
    (u) => u.toLowerCase() === dayNames[dayOfWeek]
  );
}

function getMonthKey(date: string): string {
  return date.substring(0, 7); // "2026-04"
}

function isOverFrequencyCap(
  volunteer: Volunteer,
  date: string,
  counts: VolunteerAssignmentCount,
): boolean {
  const monthKey = getMonthKey(date);
  const monthCount = counts[volunteer.id]?.byMonth[monthKey] || 0;
  return monthCount >= volunteer.availability.max_roles_per_month;
}

function hasHouseholdConflict(
  volunteer: Volunteer,
  date: string,
  serviceId: string,
  households: Household[],
  assignments: DraftAssignment[],
): boolean {
  if (!volunteer.household_id) return false;
  const household = households.find((h) => h.id === volunteer.household_id);
  if (!household) return false;

  const { never_same_service, never_same_time } = household.constraints;
  if (!never_same_service && !never_same_time) return false;

  const otherMembers = household.volunteer_ids.filter((id) => id !== volunteer.id);

  if (never_same_time) {
    // Hard constraint: no household members on ANY service on the same date
    return assignments.some(
      (a) => a.service_date === date && otherMembers.includes(a.volunteer_id),
    );
  }

  // never_same_service: no household members on the SAME service on the same date
  return assignments.some(
    (a) =>
      a.service_date === date &&
      a.service_id === serviceId &&
      otherMembers.includes(a.volunteer_id),
  );
}

/**
 * Returns a scoring bonus when a household member is already assigned to
 * the same service+date, incentivizing the scheduler to schedule families
 * together (soft preference).
 */
function getHouseholdPreferenceBonus(
  volunteer: Volunteer,
  date: string,
  serviceId: string,
  households: Household[],
  assignments: DraftAssignment[],
): number {
  if (!volunteer.household_id) return 0;
  const household = households.find((h) => h.id === volunteer.household_id);
  if (!household || !household.constraints.prefer_same_service) return 0;

  const otherMembers = household.volunteer_ids.filter((id) => id !== volunteer.id);
  const hasFamilyOnSameService = assignments.some(
    (a) =>
      a.service_date === date &&
      a.service_id === serviceId &&
      otherMembers.includes(a.volunteer_id),
  );

  return hasFamilyOnSameService ? 0.5 : 0;
}

function canServeInMinistry(volunteer: Volunteer, ministryId: string): boolean {
  // If volunteer has no ministry assignments, they can serve anywhere (flexible)
  return volunteer.ministry_ids.length === 0 || volunteer.ministry_ids.includes(ministryId);
}

function canServeInRole(volunteer: Volunteer, roleId: string): boolean {
  // If volunteer has no specific role_ids, they can fill any role in their ministry
  return volunteer.role_ids.length === 0 || volunteer.role_ids.includes(roleId);
}

function canServeAtCampus(volunteer: Volunteer, service: Service): boolean {
  // If service has no campus (org-wide), anyone can serve
  if (!service.campus_id) return true;
  // If volunteer has no campus preference, they can serve anywhere
  const campusIds = volunteer.campus_ids;
  if (!campusIds || campusIds.length === 0) return true;
  return campusIds.includes(service.campus_id);
}

/**
 * Check if a conditional role dependency is satisfied.
 * E.g., if volunteer has "Vocals requires any of [Guitar, Keys]",
 * they can only be assigned Vocals if also assigned Guitar or Keys in the same service/date.
 */
function isConditionalRoleSatisfied(
  volunteer: Volunteer,
  roleId: string,
  serviceId: string,
  date: string,
  currentAssignments: DraftAssignment[],
): boolean {
  const constraints = volunteer.role_constraints?.conditional_roles;
  if (!constraints || constraints.length === 0) return true;

  const conditional = constraints.find((c) => c.role_id === roleId);
  if (!conditional) return true; // No constraint on this role

  // Check if the volunteer is already assigned one of the required companion roles
  return currentAssignments.some(
    (a) =>
      a.volunteer_id === volunteer.id &&
      a.service_date === date &&
      a.service_id === serviceId &&
      conditional.requires_any.includes(a.role_id),
  );
}

/**
 * Check if a volunteer has completed all prerequisites for a ministry.
 * Returns true if no prerequisites exist or all are completed/waived.
 * Scope-aware: only checks org-wide prereqs relevant to team scheduling
 * (scope "all", "teams", or "specific_roles" matching the assigned role).
 */
function hasCompletedPrerequisites(
  volunteer: Volunteer,
  ministryId: string,
  ministries?: Ministry[],
  orgPrerequisites?: OnboardingStep[],
  roleId?: string,
): boolean {
  const journey = volunteer.volunteer_journey || [];

  // Check org-wide prerequisites (filtered by scope for team scheduling)
  if (orgPrerequisites && orgPrerequisites.length > 0) {
    const applicable = orgPrerequisites.filter((p) => {
      const scope = p.scope || "all";
      if (scope === "all" || scope === "teams") return true;
      if (scope === "specific_roles") {
        if (!p.role_ids || p.role_ids.length === 0) return true;
        return roleId ? p.role_ids.includes(roleId) : true;
      }
      // scope === "events" — skip for team scheduling
      return false;
    });

    const orgComplete = applicable.every((prereq) => {
      const step = journey.find(
        (j) => j.step_id === prereq.id && j.ministry_id === ORG_WIDE_MINISTRY_ID,
      );
      return step?.status === "completed" || step?.status === "waived";
    });
    if (!orgComplete) return false;
  }

  // Check ministry-specific prerequisites
  if (!ministries) return true;
  const ministry = ministries.find((m) => m.id === ministryId);
  if (!ministry?.prerequisites || ministry.prerequisites.length === 0) return true;

  return ministry.prerequisites.every((prereq) => {
    const step = journey.find(
      (j) => j.step_id === prereq.id && j.ministry_id === ministryId,
    );
    return step?.status === "completed" || step?.status === "waived";
  });
}

/** Whether a volunteer allows multi-role assignments in the same service */
function allowsMultiRole(volunteer: Volunteer): boolean {
  return volunteer.role_constraints?.allow_multi_role === true;
}

function hasValidBackgroundCheck(volunteer: Volunteer, ministryId: string, ministries?: Ministry[]): boolean {
  if (!ministries) return true;
  const ministry = ministries.find((m) => m.id === ministryId);
  if (!ministry?.requires_background_check) return true;
  const check = volunteer.background_check;
  if (!check || check.status !== "cleared") return false;
  // Check expiry
  if (check.expires_at) {
    const today = new Date().toISOString().split("T")[0];
    if (check.expires_at < today) return false;
  }
  return true;
}

// --- Scoring ---

function fairnessScore(counts: VolunteerAssignmentCount, volunteerIds: string[]): number {
  if (volunteerIds.length === 0) return 1;
  const totals = volunteerIds.map((id) => counts[id]?.total || 0);
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  if (mean === 0) return 1;
  const variance = totals.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / totals.length;
  const stdDev = Math.sqrt(variance);
  // Normalize: 1.0 = perfectly fair, approaches 0 as distribution gets worse
  return Math.max(0, 1 - stdDev / Math.max(mean, 1));
}

// --- Draft Assignment (internal) ---

export type DraftAssignment = Omit<Assignment, "id" | "confirmation_token" | "responded_at" | "reminder_sent_at">;

// --- Main Algorithm ---

export function generateDraftSchedule(
  scheduleId: string,
  churchId: string,
  services: Service[],
  volunteers: Volunteer[],
  households: Household[],
  startDate: string,
  endDate: string,
  ministries?: Ministry[],
  orgPrerequisites?: OnboardingStep[],
): SchedulingResult {
  const occurrences = generateOccurrences(services, startDate, endDate);
  const assignments: DraftAssignment[] = [];
  const conflicts: ScheduleConflict[] = [];

  // Track assignment counts per volunteer
  const counts: VolunteerAssignmentCount = {};
  for (const v of volunteers) {
    counts[v.id] = { total: 0, byDate: {}, byMonth: {} };
  }

  let totalSlots = 0;

  // --- Phase 1: Greedy Assignment ---
  for (const occurrence of occurrences) {
    const { service, date } = occurrence;

    // Iterate per-ministry roles (supports multi-ministry services with timeline filtering)
    const serviceMinistries = getServiceMinistries(service, date);
    for (const sm of serviceMinistries) {
      for (const role of sm.roles) {
        for (let slot = 0; slot < role.count; slot++) {
          totalSlots++;

          const bestVolunteer = findBestVolunteer(
            service,
            sm.ministry_id,
            role,
            date,
            volunteers,
            households,
            assignments,
            counts,
            ministries,
            orgPrerequisites,
          );

          if (bestVolunteer) {
            const assignment: DraftAssignment = {
              schedule_id: scheduleId,
              church_id: churchId,
              service_id: service.id,
              event_id: null,
              signup_type: "scheduled" as const,
              service_date: date,
              volunteer_id: bestVolunteer.id,
              role_id: role.role_id,
              role_title: role.title,
              ministry_id: sm.ministry_id,
              status: "draft" as const,
              attended: null,
              attended_at: null,
            };
            assignments.push(assignment);

            // Update counts
            const c = counts[bestVolunteer.id];
            c.total++;
            c.byDate[date] = (c.byDate[date] || 0) + 1;
            const monthKey = getMonthKey(date);
            c.byMonth[monthKey] = (c.byMonth[monthKey] || 0) + 1;
          } else {
            conflicts.push({
              type: "unfilled_role",
              service_id: service.id,
              service_date: date,
              role_id: role.role_id,
              message: `No eligible volunteer found for "${role.title}" on ${date} (${service.name})`,
            });
          }
        }
      }
    }
  }

  // --- Phase 2: Conflict Detection ---
  detectConflicts(assignments, volunteers, households, counts, conflicts);

  // --- Phase 3: Local Search for Fairness ---
  improveFairness(assignments, volunteers, households, counts, 50);

  const filledSlots = assignments.length;
  const volunteerIds = volunteers.map((v) => v.id);

  return {
    assignments,
    conflicts,
    stats: {
      total_slots: totalSlots,
      filled_slots: filledSlots,
      fill_rate: totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0,
      fairness_score: Math.round(fairnessScore(counts, volunteerIds) * 100),
    },
  };
}

export function findBestVolunteer(
  service: Service,
  ministryId: string,
  role: ServiceRole,
  date: string,
  volunteers: Volunteer[],
  households: Household[],
  currentAssignments: DraftAssignment[],
  counts: VolunteerAssignmentCount,
  ministries?: Ministry[],
  orgPrerequisites?: OnboardingStep[],
): Volunteer | null {
  // --- Pinned volunteer: try them first ---
  if (role.pinned_volunteer_id) {
    const pinned = volunteers.find((v) => v.id === role.pinned_volunteer_id);
    if (pinned && isEligible(pinned, service, ministryId, role, date, volunteers, households, currentAssignments, counts, ministries, orgPrerequisites)) {
      return pinned;
    }
    // Pinned volunteer unavailable — fall through to normal selection
  }

  // Filter eligible volunteers
  const eligible = volunteers.filter((v) =>
    isEligible(v, service, ministryId, role, date, volunteers, households, currentAssignments, counts, ministries, orgPrerequisites),
  );

  if (eligible.length === 0) return null;

  // Score candidates: prefer least-assigned, then household preference, then preferred frequency
  eligible.sort((a, b) => {
    const countA = counts[a.id]?.total || 0;
    const countB = counts[b.id]?.total || 0;
    // Primary: fewest assignments (fairness)
    if (countA !== countB) return countA - countB;
    // Secondary: prefer serving with family (prefer_same_service soft bonus)
    const bonusA = getHouseholdPreferenceBonus(a, date, service.id, households, currentAssignments);
    const bonusB = getHouseholdPreferenceBonus(b, date, service.id, households, currentAssignments);
    if (bonusA !== bonusB) return bonusB - bonusA; // Higher bonus = preferred
    // Tertiary: prefer those with higher preferred_frequency (want to serve more)
    return b.availability.preferred_frequency - a.availability.preferred_frequency;
  });

  return eligible[0];
}

/** Check all eligibility constraints for a volunteer + role + date */
function isEligible(
  v: Volunteer,
  service: Service,
  ministryId: string,
  role: ServiceRole,
  date: string,
  _volunteers: Volunteer[],
  households: Household[],
  currentAssignments: DraftAssignment[],
  counts: VolunteerAssignmentCount,
  ministries?: Ministry[],
  orgPrerequisites?: OnboardingStep[],
): boolean {
  // Must be active (safety net — callers should pre-filter)
  if (v.status !== "active") return false;
  // Must be in the right ministry
  if (!canServeInMinistry(v, ministryId)) return false;
  // Must be qualified for this specific role
  if (!canServeInRole(v, role.role_id)) return false;
  // Must be available at this campus
  if (!canServeAtCampus(v, service)) return false;
  // Must have valid background check if ministry requires it
  if (!hasValidBackgroundCheck(v, ministryId, ministries)) return false;
  // Must have completed all prerequisites (org-wide + ministry-specific, scope-aware)
  if (!hasCompletedPrerequisites(v, ministryId, ministries, orgPrerequisites, role.role_id)) return false;
  // Not blocked out
  if (isBlockedOut(v, date)) return false;
  // Not recurring unavailable
  if (isRecurringUnavailable(v, service.day_of_week)) return false;
  // Not over frequency cap
  if (isOverFrequencyCap(v, date, counts)) return false;
  // No household conflict
  if (hasHouseholdConflict(v, date, service.id, households, currentAssignments)) return false;

  // Conditional role check (e.g., Vocals requires Guitar or Keys in same service)
  if (!isConditionalRoleSatisfied(v, role.role_id, service.id, date, currentAssignments)) return false;

  // Same-service duplicate check — relaxed for multi-role volunteers
  const alreadyInService = currentAssignments.some(
    (a) => a.volunteer_id === v.id && a.service_date === date && a.service_id === service.id,
  );
  if (alreadyInService && !allowsMultiRole(v)) return false;
  // Even multi-role volunteers can't fill the exact same role twice
  if (currentAssignments.some(
    (a) => a.volunteer_id === v.id && a.service_date === date && a.service_id === service.id && a.role_id === role.role_id,
  )) return false;

  // Not double-booked at a different service on the same date (unless multi-role)
  if (!allowsMultiRole(v) && currentAssignments.some(
    (a) => a.volunteer_id === v.id && a.service_date === date && a.service_id !== service.id,
  )) return false;

  return true;
}

function detectConflicts(
  assignments: DraftAssignment[],
  volunteers: Volunteer[],
  households: Household[],
  counts: VolunteerAssignmentCount,
  conflicts: ScheduleConflict[],
): void {
  const volunteerMap = new Map(volunteers.map((v) => [v.id, v]));

  for (const a of assignments) {
    const vol = volunteerMap.get(a.volunteer_id);
    if (!vol) continue;

    // Over-frequency check
    const monthKey = getMonthKey(a.service_date);
    const monthCount = counts[vol.id]?.byMonth[monthKey] || 0;
    if (monthCount > vol.availability.max_roles_per_month) {
      conflicts.push({
        type: "overbooked",
        service_id: a.service_id || "",
        service_date: a.service_date,
        volunteer_id: vol.id,
        message: `${vol.name} is scheduled ${monthCount}× in ${monthKey} (max: ${vol.availability.max_roles_per_month})`,
      });
    }
  }
}

function improveFairness(
  assignments: DraftAssignment[],
  volunteers: Volunteer[],
  households: Household[],
  counts: VolunteerAssignmentCount,
  maxIterations: number,
): void {
  const volunteerIds = volunteers.map((v) => v.id);
  let currentScore = fairnessScore(counts, volunteerIds);

  for (let i = 0; i < maxIterations; i++) {
    // Find the most-assigned and least-assigned volunteers
    let maxId = "";
    let minId = "";
    let maxCount = -1;
    let minCount = Infinity;

    for (const id of volunteerIds) {
      const total = counts[id]?.total || 0;
      if (total > maxCount) { maxCount = total; maxId = id; }
      if (total < minCount) { minCount = total; minId = id; }
    }

    // If difference is ≤ 1, fairness is already good
    if (maxCount - minCount <= 1) break;

    // Try to swap one assignment from max to min
    const swapped = trySwap(assignments, volunteers, households, counts, maxId, minId);
    if (swapped) {
      const newScore = fairnessScore(counts, volunteerIds);
      if (newScore <= currentScore) {
        // Revert if no improvement
        trySwap(assignments, volunteers, households, counts, minId, maxId);
      } else {
        currentScore = newScore;
      }
    }
  }
}

function trySwap(
  assignments: DraftAssignment[],
  volunteers: Volunteer[],
  households: Household[],
  counts: VolunteerAssignmentCount,
  fromId: string,
  toId: string,
): boolean {
  const toVol = volunteers.find((v) => v.id === toId);
  if (!toVol) return false;

  // Find an assignment from fromId that toId could take
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    if (a.volunteer_id !== fromId) continue;

    // Check if toId can take this slot
    if (!canServeInMinistry(toVol, a.ministry_id)) continue;
    if (!canServeInRole(toVol, a.role_id)) continue;
    if (isBlockedOut(toVol, a.service_date)) continue;
    if (isRecurringUnavailable(toVol, new Date(a.service_date).getDay())) continue;
    if (hasHouseholdConflict(toVol, a.service_date, a.service_id || "", households, assignments)) continue;
    if (!isConditionalRoleSatisfied(toVol, a.role_id, a.service_id || "", a.service_date, assignments)) continue;
    if (assignments.some(
      (other) => other.volunteer_id === toId && other.service_date === a.service_date
    )) continue;

    // Perform swap
    assignments[i] = { ...a, volunteer_id: toId };

    // Update counts
    counts[fromId].total--;
    const monthKey = getMonthKey(a.service_date);
    counts[fromId].byMonth[monthKey] = (counts[fromId].byMonth[monthKey] || 1) - 1;
    counts[fromId].byDate[a.service_date] = (counts[fromId].byDate[a.service_date] || 1) - 1;

    counts[toId].total++;
    counts[toId].byMonth[monthKey] = (counts[toId].byMonth[monthKey] || 0) + 1;
    counts[toId].byDate[a.service_date] = (counts[toId].byDate[a.service_date] || 0) + 1;

    return true;
  }

  return false;
}
