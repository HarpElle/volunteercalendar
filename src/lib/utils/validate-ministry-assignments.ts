import type { MinistryAssignment } from "@/lib/types";

export interface AssignmentValidationError {
  ministry_id: string;
  message: string;
  conflicting_indices: [number, number];
}

/**
 * Validates that a service's ministry_assignments have no overlapping
 * effective date ranges for the same ministry_id.
 *
 * Returns an array of validation errors (empty = valid).
 */
export function validateMinistryAssignments(
  assignments: MinistryAssignment[],
): AssignmentValidationError[] {
  const errors: AssignmentValidationError[] = [];

  // Group assignments by ministry_id
  const byMinistry = new Map<string, { index: number; assignment: MinistryAssignment }[]>();
  for (let i = 0; i < assignments.length; i++) {
    const ma = assignments[i];
    const existing = byMinistry.get(ma.ministry_id) || [];
    existing.push({ index: i, assignment: ma });
    byMinistry.set(ma.ministry_id, existing);
  }

  // Check each ministry for overlapping date ranges
  for (const [ministryId, entries] of byMinistry) {
    if (entries.length < 2) continue;

    // Sort by effective_from for easier comparison
    entries.sort((a, b) => a.assignment.effective_from.localeCompare(b.assignment.effective_from));

    for (let i = 0; i < entries.length - 1; i++) {
      const current = entries[i].assignment;
      const next = entries[i + 1].assignment;

      // If current has no end date (open-ended) and next starts, they overlap
      if (current.effective_until === null) {
        errors.push({
          ministry_id: ministryId,
          message: `Open-ended assignment for "${ministryId}" (from ${current.effective_from}) overlaps with assignment starting ${next.effective_from}. Set an effective_until date on the earlier assignment.`,
          conflicting_indices: [entries[i].index, entries[i + 1].index],
        });
        continue;
      }

      // Check if current's end date overlaps with next's start date
      if (current.effective_until >= next.effective_from) {
        errors.push({
          ministry_id: ministryId,
          message: `Overlapping date ranges for "${ministryId}": ${current.effective_from}–${current.effective_until} overlaps with ${next.effective_from}–${next.effective_until || "ongoing"}.`,
          conflicting_indices: [entries[i].index, entries[i + 1].index],
        });
      }
    }
  }

  return errors;
}
