import type { OrgRole, Membership } from "@/lib/types";

/**
 * Role hierarchy: owner > admin > scheduler > volunteer
 * Higher index = more permissions.
 */
const ROLE_RANK: Record<OrgRole, number> = {
  volunteer: 0,
  scheduler: 1,
  admin: 2,
  owner: 3,
};

/** Returns true if `role` is at least `minimumRole` in the hierarchy. */
export function hasMinimumRole(role: OrgRole, minimumRole: OrgRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole];
}

/** Convenience checks for common permission gates. */
export function isOwner(membership: Membership | null): boolean {
  return membership?.status === "active" && membership.role === "owner";
}

export function isAdmin(membership: Membership | null): boolean {
  return membership?.status === "active" && hasMinimumRole(membership.role, "admin");
}

export function isScheduler(membership: Membership | null): boolean {
  return membership?.status === "active" && hasMinimumRole(membership.role, "scheduler");
}

export function isVolunteer(membership: Membership | null): boolean {
  return membership?.status === "active" && hasMinimumRole(membership.role, "volunteer");
}

/**
 * Returns true if the membership has scheduling authority over a given ministry.
 * - Admins and owners can schedule any ministry.
 * - Schedulers can only schedule ministries in their `ministry_scope` (empty = all).
 */
export function canScheduleMinistry(
  membership: Membership | null,
  ministryId: string,
): boolean {
  if (!membership || membership.status !== "active") return false;
  if (hasMinimumRole(membership.role, "admin")) return true;
  if (membership.role === "scheduler") {
    return (
      membership.ministry_scope.length === 0 ||
      membership.ministry_scope.includes(ministryId)
    );
  }
  return false;
}

/**
 * Returns true if the membership can manage members (invite, approve, remove).
 * Only admins and owners.
 */
export function canManageMembers(membership: Membership | null): boolean {
  return isAdmin(membership);
}

/**
 * Returns true if the membership can manage billing.
 * Only the owner.
 */
export function canManageBilling(membership: Membership | null): boolean {
  return isOwner(membership);
}

/**
 * Returns true if the membership can edit org settings (name, workflow mode, etc.).
 * Admins and owners.
 */
export function canEditOrgSettings(membership: Membership | null): boolean {
  return isAdmin(membership);
}

/**
 * Given a list of memberships, find the one for a specific church.
 */
export function getMembershipForChurch(
  memberships: Membership[],
  churchId: string,
): Membership | null {
  return memberships.find((m) => m.church_id === churchId) || null;
}

/**
 * Returns only active memberships from a list.
 */
export function getActiveMemberships(memberships: Membership[]): Membership[] {
  return memberships.filter((m) => m.status === "active");
}

/**
 * Returns memberships pending action from the user (invites they haven't accepted).
 */
export function getPendingInvites(memberships: Membership[]): Membership[] {
  return memberships.filter((m) => m.status === "pending_volunteer_approval");
}
