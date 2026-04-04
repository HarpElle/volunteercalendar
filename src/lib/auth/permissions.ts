/**
 * Permission utilities for the unified Person model.
 *
 * Complements `@/lib/utils/permissions` (role hierarchy checks) with
 * Person-aware, feature-aware, and permission-flag-aware checks.
 */

import type { Membership, Person, PermissionFlag } from "@/lib/types";

// ─── Role Helpers ──────────────────────────────────────────────────────────

/** Returns true if the membership is owner or admin. */
export function isGlobalAdmin(membership: Membership): boolean {
  return membership.role === "owner" || membership.role === "admin";
}

// ─── Permission Flag Checks ────────────────────────────────────────────────

/**
 * Check if a membership has a specific permission flag.
 * Admin/Owner implicitly have ALL permission flags.
 */
export function hasPermission(membership: Membership, permission: PermissionFlag): boolean {
  if (isGlobalAdmin(membership)) return true;
  switch (permission) {
    case "event_coordinator":
      return membership.event_coordinator === true;
    case "facility_coordinator":
      return membership.facility_coordinator === true;
    case "checkin_volunteer":
      return membership.checkin_volunteer === true;
    default:
      return false;
  }
}

// ─── Feature-Specific Checks ───────────────────────────────────────────────

/**
 * Returns true if the membership can schedule a specific ministry.
 * - Admin/Owner: can schedule any ministry
 * - Scheduler: can schedule ministries in their scope (empty = all)
 * - Others: no
 */
export function canScheduleMinistry(membership: Membership, ministryId: string): boolean {
  if (isGlobalAdmin(membership)) return true;
  if (membership.role !== "scheduler") return false;
  return membership.ministry_scope.length === 0 || membership.ministry_scope.includes(ministryId);
}

/** Returns true if the membership can manage the check-in system. */
export function canManageCheckIn(m: Membership): boolean {
  return hasPermission(m, "checkin_volunteer");
}

/** Returns true if the membership can manage facilities/rooms. */
export function canManageFacilities(m: Membership): boolean {
  return hasPermission(m, "facility_coordinator");
}

/** Returns true if the membership can manage events. */
export function canManageEvents(m: Membership): boolean {
  return hasPermission(m, "event_coordinator");
}

// ─── Person-Level Checks ───────────────────────────────────────────────────

/**
 * Returns true if the membership can view a Person's basic info.
 * All active members of the same church can view directory-level info.
 */
export function canViewPerson(membership: Membership, target: Person): boolean {
  if (membership.church_id !== target.church_id) return false;
  if (membership.status !== "active") return false;
  // All active members can view basic person info (directory)
  return true;
}

/**
 * Returns true if the membership can edit a Person record.
 * - Admin/Owner: can edit anyone in their church
 * - Users can edit their own profile
 * - Schedulers can edit volunteers in their scoped ministries
 * - Check-in volunteers can edit children's profiles
 */
export function canEditPerson(membership: Membership, target: Person): boolean {
  if (membership.church_id !== target.church_id) return false;
  if (isGlobalAdmin(membership)) return true;

  // Users can edit their own profile
  if (
    target.person_type === "adult" &&
    target.user_id &&
    target.user_id === membership.user_id
  ) {
    return true;
  }

  // Schedulers can edit volunteers in their scoped ministries
  if (membership.role === "scheduler" && target.is_volunteer) {
    if (membership.ministry_scope.length === 0) return true;
    return target.ministry_ids.some((mid) => canScheduleMinistry(membership, mid));
  }

  // Check-in volunteers can edit children's profiles
  if (canManageCheckIn(membership) && target.person_type === "child") {
    return true;
  }

  return false;
}

// ─── Feature Access (UI Gating) ────────────────────────────────────────────

export type FeatureArea =
  | "scheduling"
  | "checkin"
  | "rooms"
  | "events"
  | "service_planning"
  | "stage_sync";

/**
 * Returns true if the membership's role + permission flags grant access
 * to a given feature area. Does NOT check tier-level feature flags —
 * use this in conjunction with FeatureGate for complete gating.
 */
export function canAccessFeature(membership: Membership, feature: FeatureArea): boolean {
  switch (feature) {
    case "scheduling":
      return isGlobalAdmin(membership) || membership.role === "scheduler";
    case "checkin":
      return isGlobalAdmin(membership) || canManageCheckIn(membership);
    case "rooms":
      return isGlobalAdmin(membership) || canManageFacilities(membership);
    case "events":
      return isGlobalAdmin(membership) || canManageEvents(membership);
    case "service_planning":
      return isGlobalAdmin(membership) || membership.role === "scheduler";
    case "stage_sync":
      return isGlobalAdmin(membership) || membership.role === "scheduler";
    default:
      return false;
  }
}
