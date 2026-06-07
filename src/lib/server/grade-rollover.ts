/**
 * Annual grade rollover — shared logic used by both the daily cron
 * (/api/cron/grade-rollover) and the future manual-trigger admin
 * endpoint. Kept pure so it can be unit-tested without standing up
 * the Firestore emulator.
 */

import type { ChildGrade } from "@/lib/types";

/**
 * The grade progression. Last entry is the implicit "graduate" sentinel
 * — children at `6th` become inactive on rollover, not advanced.
 */
const PROGRESSION: ChildGrade[] = [
  "nursery",
  "toddler",
  "pre-k",
  "kindergarten",
  "1st",
  "2nd",
  "3rd",
  "4th",
  "5th",
  "6th",
  "7th",
];

/**
 * Compute the next grade after a rollover. Returns:
 *   - the next grade string when the child advances
 *   - "graduate" sentinel when the child ages out (was 6th)
 *   - null when the input grade is unknown / not set (no change)
 */
export function nextGradeAfterRollover(
  current: ChildGrade | string | null | undefined,
): ChildGrade | "graduate" | null {
  if (!current) return null;
  const idx = PROGRESSION.indexOf(current as ChildGrade);
  if (idx === -1) return null;
  if (idx === PROGRESSION.length - 1) return "graduate";
  return PROGRESSION[idx + 1];
}

/**
 * Returns true when today's date matches the configured rollover
 * month + day. Rollover fires on the 1st of June / August / September
 * for orgs whose settings.grade_rollover is set accordingly.
 *
 * `today` is injected so tests can pin to a specific date.
 */
export function shouldRunRolloverForOrg(
  policy: "manual" | "june" | "august" | "september" | undefined,
  today: Date,
): boolean {
  if (!policy || policy === "manual") return false;
  const day = today.getUTCDate();
  if (day !== 1) return false;
  const month = today.getUTCMonth(); // 0-indexed
  if (policy === "june") return month === 5;
  if (policy === "august") return month === 7;
  if (policy === "september") return month === 8;
  return false;
}

/**
 * Returns true when the child should be advanced. We skip children
 * whose `updated_at` is within the last 60 days so a recent parent
 * edit (Family Portal self-service) doesn't get stomped.
 */
export function shouldAdvanceChild(input: {
  updated_at: string | null | undefined;
  now: Date;
}): boolean {
  if (!input.updated_at) return true;
  const ms = Date.parse(input.updated_at);
  if (Number.isNaN(ms)) return true;
  const daysSince = (input.now.getTime() - ms) / (1000 * 60 * 60 * 24);
  return daysSince >= 60;
}
