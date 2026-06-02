/**
 * Wave 12 C — pure predicate for "should this swap escalate?".
 *
 * The cron iterates all open swap_requests across the platform daily.
 * Each one runs through this predicate to decide whether to fire the
 * scheduler-escalation email. Extracted from the route so the rules
 * are regression-tested in isolation — date string math + the
 * once-only rule are easy to break with a one-character edit.
 *
 * Contract:
 *   - Only "open" swaps escalate (auto_approved / approved / cancelled
 *     are already resolved; pending_admin already escalated to a human).
 *   - Escalate when service_date is today or tomorrow. Earlier than
 *     tomorrow = service has already passed (cron caught it late);
 *     later than tomorrow = still has runway for peers to claim.
 *   - Never escalate twice. Once `escalated_at` is set, subsequent
 *     daily runs skip this swap. The scheduler can act on it via the
 *     in-app or email link; no need to nag.
 *
 * Both dates are YYYY-MM-DD strings — lexicographic comparison is
 * correct because the format is ISO-ordered. No Date object math.
 */

import type { SwapRequest } from "@/lib/types";

export interface ShouldEscalateInput {
  /** The candidate swap, must already be loaded. */
  swap: Pick<SwapRequest, "status" | "service_date" | "escalated_at">;
  /** Caller-supplied "today" in YYYY-MM-DD (the cron computes this from new Date()). */
  todayIso: string;
  /** Caller-supplied "tomorrow" in YYYY-MM-DD. */
  tomorrowIso: string;
}

export function shouldEscalateSwap(input: ShouldEscalateInput): boolean {
  const { swap, todayIso, tomorrowIso } = input;

  // Already-resolved or already-handed-to-admin paths skip escalation.
  if (swap.status !== "open") return false;

  // Once-only rule — the whole reason this field exists.
  if (swap.escalated_at) return false;

  // Service date must be today or tomorrow. Anything later still has
  // runway for teammates to claim via the peer-swap path; anything
  // earlier is past or same-day-already-very-late.
  if (swap.service_date !== todayIso && swap.service_date !== tomorrowIso) {
    return false;
  }

  return true;
}

/**
 * Compute "tomorrow's date" in YYYY-MM-DD given today. Pulled out so
 * the cron's date math is testable alongside the predicate. UTC-based
 * because the cron runs on Vercel infra; church-local timezone
 * differences are < 1 day and the rule is intentionally fuzzy (~24h
 * before service, not "exactly 24h").
 */
export function addOneDayIso(todayIso: string): string {
  // todayIso is "YYYY-MM-DD"; parse as UTC midnight, add 24h, slice.
  // Anchoring to T00:00:00Z avoids the JS engine assuming local TZ
  // (which would shift the day at the boundary).
  const t = new Date(`${todayIso}T00:00:00Z`).getTime();
  return new Date(t + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
