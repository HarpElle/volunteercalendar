import type { Membership, OrgRole } from "@/lib/types";

const CHECKIN_ADMIN_ROLES: OrgRole[] = ["owner", "admin", "scheduler"];

/**
 * Can this member access the check-in dashboard, households, children, reports?
 * True for scheduler+ OR anyone with the checkin_volunteer flag.
 */
export function canAccessCheckin(membership: Pick<Membership, "role" | "checkin_volunteer">): boolean {
  return CHECKIN_ADMIN_ROLES.includes(membership.role) || membership.checkin_volunteer === true;
}

/**
 * Can this member manage check-in settings, configure printers, import data?
 * Only admin+ (settings are sensitive).
 */
export function canManageCheckinSettings(membership: Pick<Membership, "role">): boolean {
  return membership.role === "owner" || membership.role === "admin";
}
