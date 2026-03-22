import type { Volunteer, Ministry, OnboardingStep } from "@/lib/types";
import { ORG_WIDE_MINISTRY_ID } from "@/lib/types";

export type EligibilityStage = "cleared" | "in_progress" | "not_started";
export type OrgEligibility = EligibilityStage | "no_prereqs";

/**
 * Filter prerequisites by scope context and optional role.
 * Absent scope defaults to "all" (backward-compatible).
 */
export function getApplicablePrereqs(
  prereqs: OnboardingStep[],
  context?: "teams" | "events",
  roleId?: string,
): OnboardingStep[] {
  return prereqs.filter((p) => {
    const scope = p.scope || "all";
    if (scope === "all") return true;
    if (context && scope === context) return true;
    if (scope === "specific_roles") {
      if (!p.role_ids || p.role_ids.length === 0) return true; // no roles specified = applies to all
      return roleId ? p.role_ids.includes(roleId) : true; // if no roleId context, include it
    }
    // scope doesn't match context
    if (context) return false;
    // no context = include everything (for overall badge)
    return true;
  });
}

/**
 * Check org-wide eligibility for a volunteer.
 * Returns "no_prereqs" when the org has no prerequisites defined.
 * Optional `context` filters prereqs by scope (teams/events).
 */
export function getOrgEligibility(
  volunteer: Volunteer,
  orgPrereqs: OnboardingStep[],
  context?: "teams" | "events",
): OrgEligibility {
  const applicable = getApplicablePrereqs(orgPrereqs, context);
  if (applicable.length === 0) return "no_prereqs";

  const journey = volunteer.volunteer_journey || [];
  const completed = applicable.filter((p) => {
    const step = journey.find(
      (j) => j.step_id === p.id && j.ministry_id === ORG_WIDE_MINISTRY_ID,
    );
    return step?.status === "completed" || step?.status === "waived";
  });

  if (completed.length === applicable.length) return "cleared";
  if (completed.length > 0) return "in_progress";

  const hasInProgress = applicable.some((p) => {
    const step = journey.find(
      (j) => j.step_id === p.id && j.ministry_id === ORG_WIDE_MINISTRY_ID,
    );
    return step?.status === "in_progress";
  });

  return hasInProgress ? "in_progress" : "not_started";
}

/**
 * Full eligibility stage for a volunteer in a specific ministry.
 * Combines org-wide + ministry-specific prerequisites.
 * Extracted from onboarding/page.tsx getVolunteerStage().
 */
export function getVolunteerStage(
  volunteer: Volunteer,
  ministry: Ministry,
  orgPrereqs: OnboardingStep[],
  context?: "teams" | "events",
): EligibilityStage {
  const applicableOrg = getApplicablePrereqs(orgPrereqs, context);
  const teamPrereqs = ministry.prerequisites || [];
  const allPrereqs = [
    ...applicableOrg.map((p) => ({ ...p, _ministryId: ORG_WIDE_MINISTRY_ID })),
    ...teamPrereqs.map((p) => ({ ...p, _ministryId: ministry.id })),
  ];

  if (allPrereqs.length === 0) return "cleared";

  const journey = volunteer.volunteer_journey || [];
  const completed = allPrereqs.filter((p) => {
    const step = journey.find(
      (j) => j.step_id === p.id && j.ministry_id === p._ministryId,
    );
    return step?.status === "completed" || step?.status === "waived";
  });

  if (completed.length === allPrereqs.length) return "cleared";
  if (completed.length > 0) return "in_progress";

  const hasInProgress = allPrereqs.some((p) => {
    const step = journey.find(
      (j) => j.step_id === p.id && j.ministry_id === p._ministryId,
    );
    return step?.status === "in_progress";
  });

  return hasInProgress ? "in_progress" : "not_started";
}
