/**
 * Ratio enforcement helpers — Wave 9 P0-5 sub-PR A.
 *
 * This module is the single source of truth for the volunteer-to-
 * child ratio gate that ECAP Indicator 3.12 (two-deep leadership)
 * + GuideOne / Brotherhood Mutual underwriting guidance translate
 * into. Pure functions; consumed by:
 *
 *   - the kiosk check-in route (sub-PR C) to gate child check-ins
 *     when the room is at warning or violation
 *   - the room roster API (sub-PR B) to surface live status
 *   - the room dashboard wall view (sub-PR E) to render the
 *     traffic-light status
 *
 * The "no policy → bypass" semantics mirror the existing
 * `hasValidBackgroundCheck` pattern from the scheduler: when a room
 * has `ratio_policy` undefined or `enabled: false`, every gate
 * function returns "ok." Existing rooms are unaffected until an
 * admin opts in.
 *
 * Two-deep leadership is encoded as:
 *   - `min_volunteers >= 2` (typical) AND
 *   - `min_unrelated_adults >= 2` (so a parent + child volunteering
 *     don't satisfy the requirement on their own)
 *
 * `computeRelatedTo()` builds the `related_to` snapshot at
 * volunteer check-in time from household overlap; that snapshot is
 * what `countUnrelatedAdults()` reads to honor "related adults
 * count as 1 volunteer but don't satisfy two-deep" (Jason
 * 2026-05-29 decision).
 */

import type { Room, RoomVolunteerCheckIn } from "@/lib/types";

export type RatioStatus = "ok" | "warning" | "violation";

export interface RatioEvaluation {
  /** Current count of CHILDREN actively checked in to this room. */
  children: number;
  /** Current count of VOLUNTEERS actively checked in to this room. */
  volunteers: number;
  /** Subset of `volunteers` that count as "unrelated adults" for the
   *  two-deep gate. Computed from the `related_to` snapshots. */
  unrelated_adults: number;
  /** Effective max children allowed under the policy + current
   *  volunteer count. `null` when no policy (or disabled). */
  max_children_for_current_volunteers: number | null;
  /** True when two-deep is satisfied (or policy doesn't require it). */
  two_deep_ok: boolean;
  /** True when adding ONE more child would still be within ratio
   *  + max_children. */
  ratio_ok: boolean;
  /** Composite traffic-light status. */
  status: RatioStatus;
  /** Human-readable summary for the kiosk banner / dashboard tile. */
  message: string;
}

/**
 * Default warning threshold (percent of effective max children).
 * Settings can override per-org via
 * `CheckInSettings.ratio_warning_threshold_percent`.
 */
export const DEFAULT_RATIO_WARNING_PERCENT = 90;

/**
 * Build the snapshot of "other volunteers in this room whose
 * households overlap mine." Called at volunteer check-in time and
 * persisted on the RoomVolunteerCheckIn doc so the related_to
 * computation doesn't have to re-query households later (which
 * would let a household-membership change retroactively flip a
 * past check-in).
 *
 * @param thisVolunteerHouseholdIds — household IDs of the volunteer
 *   being checked in.
 * @param otherVolunteersInRoom — array of `{ person_id,
 *   household_ids }` for the volunteers ALREADY checked in to this
 *   room for this service_date.
 *
 * Returns the subset of other volunteer person IDs whose
 * household_ids overlap this volunteer's. Empty array when this
 * volunteer has no households on file.
 */
export function computeRelatedTo(
  thisVolunteerHouseholdIds: string[],
  otherVolunteersInRoom: Array<{
    person_id: string;
    household_ids: string[];
  }>,
): string[] {
  if (thisVolunteerHouseholdIds.length === 0) return [];
  const mine = new Set(thisVolunteerHouseholdIds);
  return otherVolunteersInRoom
    .filter((other) =>
      (other.household_ids ?? []).some((h) => mine.has(h)),
    )
    .map((other) => other.person_id);
}

/**
 * Count volunteers who don't share a household with ANY other
 * volunteer in the room. A volunteer with `related_to: []` counts
 * as unrelated. A volunteer related to one or more others is
 * counted as "related" (and the OTHER ends of those relationships
 * are also marked related — household-related pairs collapse into
 * a single "related" cluster, not double-counted as related on
 * both sides).
 *
 * Edge case: if A and B are related to each other only, both are
 * counted in the related cluster, so unrelated = total - 2.
 */
export function countUnrelatedAdults(
  volunteers: Pick<RoomVolunteerCheckIn, "person_id" | "related_to">[],
): number {
  return volunteers.filter((v) => (v.related_to ?? []).length === 0).length;
}

/**
 * Evaluate the room's ratio status given the current population
 * counts. Pure function; no I/O.
 *
 * Inputs:
 *   - room: must carry `ratio_policy` (otherwise returns "no policy"
 *     bypass result).
 *   - children: count of active child check-ins (not checked out).
 *   - volunteers: array of active RoomVolunteerCheckIn rows for the
 *     room — used to count total + compute unrelated.
 *   - warningPercent: 0–100, defaults to
 *     DEFAULT_RATIO_WARNING_PERCENT.
 *
 * Status decision (top to bottom; first match wins):
 *   - "violation": more children than the ratio allows, OR
 *     max_children exceeded, OR min_volunteers floor not met
 *     with at least one child checked in, OR two-deep policy not
 *     satisfied with at least one child checked in.
 *   - "warning": ratio_ok = true but at or above the warning
 *     percent threshold.
 *   - "ok": comfortably under threshold.
 *
 * The kiosk gate fires at "violation"; the warning banner fires at
 * "warning."
 */
export function evaluateRatio(
  room: Pick<Room, "ratio_policy">,
  children: number,
  volunteers: Pick<RoomVolunteerCheckIn, "person_id" | "related_to">[],
  warningPercent: number = DEFAULT_RATIO_WARNING_PERCENT,
): RatioEvaluation {
  const policy = room.ratio_policy;
  const volCount = volunteers.length;
  const unrelated = countUnrelatedAdults(volunteers);

  // No policy / disabled → bypass.
  if (!policy?.enabled) {
    return {
      children,
      volunteers: volCount,
      unrelated_adults: unrelated,
      max_children_for_current_volunteers: null,
      two_deep_ok: true,
      ratio_ok: true,
      status: "ok",
      message: "No ratio policy",
    };
  }

  const maxChildrenForVolunteers =
    volCount * policy.max_children_per_volunteer;
  const effectiveMaxChildren = policy.max_children
    ? Math.min(maxChildrenForVolunteers, policy.max_children)
    : maxChildrenForVolunteers;

  // Two-deep: counts only when at least one child is checked in.
  // An empty room can't violate two-deep — there's nobody to
  // protect.
  const twoDeepRequired =
    children > 0 && policy.min_unrelated_adults > 0;
  const twoDeepOk =
    !twoDeepRequired || unrelated >= policy.min_unrelated_adults;

  // Min-volunteers: counts only when at least one child is checked in.
  const minVolFloorRequired =
    children > 0 && policy.min_volunteers > 0;
  const minVolFloorOk =
    !minVolFloorRequired || volCount >= policy.min_volunteers;

  const ratioOk = children < effectiveMaxChildren;
  const maxCapOk =
    policy.max_children === undefined || children < policy.max_children;

  let status: RatioStatus = "ok";
  let message = "";

  if (!ratioOk || !maxCapOk || !twoDeepOk || !minVolFloorOk) {
    status = "violation";
    const violations: string[] = [];
    if (!minVolFloorOk) {
      violations.push(
        `min ${policy.min_volunteers} volunteer${policy.min_volunteers === 1 ? "" : "s"} required (currently ${volCount})`,
      );
    }
    if (!twoDeepOk) {
      violations.push(
        `min ${policy.min_unrelated_adults} unrelated adults required (currently ${unrelated})`,
      );
    }
    if (!ratioOk) {
      violations.push(
        `${children}/${effectiveMaxChildren} child${effectiveMaxChildren === 1 ? "" : "ren"} per ratio`,
      );
    }
    if (!maxCapOk) {
      violations.push(`${children}/${policy.max_children} room cap`);
    }
    message = `Over capacity: ${violations.join("; ")}`;
  } else if (
    effectiveMaxChildren > 0 &&
    (children * 100) / effectiveMaxChildren >= warningPercent
  ) {
    status = "warning";
    message = `Near capacity: ${children}/${effectiveMaxChildren} children`;
  } else {
    status = "ok";
    message = `${children}/${effectiveMaxChildren} children · ${volCount} volunteer${volCount === 1 ? "" : "s"}`;
  }

  return {
    children,
    volunteers: volCount,
    unrelated_adults: unrelated,
    max_children_for_current_volunteers: effectiveMaxChildren,
    two_deep_ok: twoDeepOk,
    ratio_ok: ratioOk && maxCapOk,
    status,
    message,
  };
}

/**
 * Predicate: can ONE more child be checked in to this room without
 * tripping the violation gate?
 *
 * Used by the kiosk check-in route. The gate fires:
 *   - at violation → block (operator can override via X-Ratio-
 *     Override on a staffed station)
 *   - at warning → allow but show amber banner + emit
 *     `kiosk.ratio_warning_shown` audit
 *   - at ok → allow silently
 */
export function canCheckInOneMore(
  room: Pick<Room, "ratio_policy">,
  childrenNow: number,
  volunteers: Pick<RoomVolunteerCheckIn, "person_id" | "related_to">[],
  warningPercent: number = DEFAULT_RATIO_WARNING_PERCENT,
): RatioEvaluation {
  return evaluateRatio(room, childrenNow + 1, volunteers, warningPercent);
}
