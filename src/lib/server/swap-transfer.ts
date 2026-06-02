/**
 * Swap transfer helper (Wave 12 A hotfix).
 *
 * Centralizes the assignment-update payload used when a swap is
 * accepted or admin-approved. Pulled out specifically because the
 * initial W12-A ship only wrote `volunteer_id`, leaving `person_id`
 * pointed at the original requester — and `/api/my-schedule` queries
 * by `person_id`, so the original volunteer still saw the assignment
 * and the new volunteer didn't. (Codex Sev 2 regression #1.)
 *
 * Contract: `volunteer_id` and `person_id` MUST move in lockstep
 * because the codebase has two readers using each field
 * interchangeably:
 *   - /api/my-schedule queries assignments by `person_id`
 *   - swap eligibility (POST /api/swap GET) reads both
 *   - Older callers (claim, manual edit) write both equal
 *
 * Both fields hold the Person doc id (NOT the auth uid). Keep them
 * equal until/unless we have a deliberate reason to separate them.
 */

export interface SwapTransferUpdate {
  /** New owning Person doc id. */
  person_id: string;
  /** Kept equal to person_id — older code paths read this. */
  volunteer_id: string;
  /** Always "confirmed" — accepting a swap implicitly confirms the new owner. */
  status: "confirmed";
  /** ISO timestamp for the transfer event. */
  updated_at: string;
}

/**
 * Build the Firestore update payload that hands an assignment off to
 * the new volunteer. Pure — no I/O. The route handler is responsible
 * for calling .update() with the result.
 *
 * @param replacementPersonId - Person doc id of the volunteer who is
 *   now responsible for the assignment.
 * @param nowIso - ISO timestamp to stamp on `updated_at`. Caller
 *   passes `new Date().toISOString()` (kept as a param so the
 *   function stays pure + trivially testable).
 */
export function buildSwapTransferUpdate(
  replacementPersonId: string,
  nowIso: string,
): SwapTransferUpdate {
  return {
    person_id: replacementPersonId,
    volunteer_id: replacementPersonId,
    status: "confirmed",
    updated_at: nowIso,
  };
}
