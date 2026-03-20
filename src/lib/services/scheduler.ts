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
  Assignment,
  ScheduleConflict,
  SchedulingResult,
  ServiceOccurrence,
  ScheduleStatus,
} from "@/lib/types";
import { getServiceMinistries } from "@/lib/utils/service-helpers";

// --- Date Helpers ---

/** Generate all dates a service occurs within a range */
export function generateOccurrences(
  services: Service[],
  startDate: string,
  endDate: string,
): ServiceOccurrence[] {
  const occurrences: ServiceOccurrence[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

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
        date: current.toISOString().split("T")[0],
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

interface VolunteerAssignmentCount {
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
  if (!household || !household.constraints.never_same_service) return false;

  // Check if any household member is already assigned on the same date
  const otherMembers = household.volunteer_ids.filter((id) => id !== volunteer.id);
  return assignments.some(
    (a) =>
      a.service_date === date &&
      otherMembers.includes(a.volunteer_id),
  );
}

function canServeInMinistry(volunteer: Volunteer, ministryId: string): boolean {
  // If volunteer has no ministry assignments, they can serve anywhere (flexible)
  return volunteer.ministry_ids.length === 0 || volunteer.ministry_ids.includes(ministryId);
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

type DraftAssignment = Omit<Assignment, "id" | "confirmation_token" | "responded_at" | "reminder_sent_at">;

// --- Main Algorithm ---

export function generateDraftSchedule(
  scheduleId: string,
  churchId: string,
  services: Service[],
  volunteers: Volunteer[],
  households: Household[],
  startDate: string,
  endDate: string,
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

    // Iterate per-ministry roles (supports multi-ministry services)
    const serviceMinistries = getServiceMinistries(service);
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

function findBestVolunteer(
  service: Service,
  ministryId: string,
  role: ServiceRole,
  date: string,
  volunteers: Volunteer[],
  households: Household[],
  currentAssignments: DraftAssignment[],
  counts: VolunteerAssignmentCount,
): Volunteer | null {
  // Filter eligible volunteers
  const eligible = volunteers.filter((v) => {
    // Must be in the right ministry
    if (!canServeInMinistry(v, ministryId)) return false;
    // Not blocked out
    if (isBlockedOut(v, date)) return false;
    // Not recurring unavailable
    if (isRecurringUnavailable(v, service.day_of_week)) return false;
    // Not over frequency cap
    if (isOverFrequencyCap(v, date, counts)) return false;
    // No household conflict
    if (hasHouseholdConflict(v, date, service.id, households, currentAssignments)) return false;
    // Not already assigned to this service on this date
    if (currentAssignments.some(
      (a) => a.volunteer_id === v.id && a.service_date === date && a.service_id === service.id
    )) return false;
    // Not double-booked at the same time on the same date
    if (currentAssignments.some(
      (a) => a.volunteer_id === v.id && a.service_date === date && a.service_id !== service.id
    )) return false;

    return true;
  });

  if (eligible.length === 0) return null;

  // Score candidates: prefer least-assigned, then those closer to preferred frequency
  eligible.sort((a, b) => {
    const countA = counts[a.id]?.total || 0;
    const countB = counts[b.id]?.total || 0;
    // Primary: fewest assignments (fairness)
    if (countA !== countB) return countA - countB;
    // Secondary: prefer those with higher preferred_frequency (want to serve more)
    return b.availability.preferred_frequency - a.availability.preferred_frequency;
  });

  return eligible[0];
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
    if (isBlockedOut(toVol, a.service_date)) continue;
    if (isRecurringUnavailable(toVol, new Date(a.service_date).getDay())) continue;
    if (hasHouseholdConflict(toVol, a.service_date, a.service_id || "", households, assignments)) continue;
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
