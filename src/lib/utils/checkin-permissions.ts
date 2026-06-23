import type { Membership, OrgRole } from "@/lib/types";

const CHECKIN_ADMIN_ROLES: OrgRole[] = ["owner", "admin", "scheduler"];
const CHECKIN_NAV_ADMIN_ROLES: OrgRole[] = ["owner", "admin"];

/**
 * Can this member access the check-in dashboard, households, children, reports?
 * True for scheduler+ OR anyone with the checkin_volunteer flag.
 *
 * This is the PAGE-ACCESS gate (permissive): if the user navigates to a
 * check-in URL directly, this decides whether they can load it. Schedulers
 * are auto-allowed here because they may need to step in for check-in
 * coverage even if they don't carry the volunteer flag day-to-day.
 *
 * For NAV VISIBILITY (sidebar / mobile bottom nav / mobile More menu),
 * use `shouldShowCheckinNav` instead — stricter, requires explicit
 * checkin_volunteer flag for schedulers.
 */
export function canAccessCheckin(
  membership: Pick<Membership, "role" | "checkin_volunteer" | "checkin_manager">,
): boolean {
  return (
    CHECKIN_ADMIN_ROLES.includes(membership.role) ||
    membership.checkin_volunteer === true ||
    membership.checkin_manager === true
  );
}

/**
 * Should the Check-In module appear in this member's nav (sidebar, mobile
 * bottom nav, mobile More menu)?
 *
 * Stricter than `canAccessCheckin`: owners and admins always see Check-In
 * (they manage settings); schedulers only see it if they ALSO have the
 * `checkin_volunteer` flag (i.e. they're explicitly part of the check-in
 * team). This keeps the nav focused on modules the user actually uses,
 * while still allowing schedulers to navigate to check-in URLs directly
 * via `canAccessCheckin` if needed.
 *
 * Codex Phase 1 v3 retest finding: scheduler-without-checkin_volunteer
 * should not see Check-In in nav even on Growth/Pro tiers.
 */
export function shouldShowCheckinNav(
  membership: Pick<Membership, "role" | "checkin_volunteer" | "checkin_manager">,
): boolean {
  return (
    CHECKIN_NAV_ADMIN_ROLES.includes(membership.role) ||
    membership.checkin_volunteer === true ||
    membership.checkin_manager === true
  );
}

/**
 * Can this member manage check-in settings, configure printers, import data?
 * Only admin+ (settings are sensitive).
 */
export function canManageCheckinSettings(membership: Pick<Membership, "role">): boolean {
  return membership.role === "owner" || membership.role === "admin";
}

/**
 * Can this member open the classroom view for ANY room (roster,
 * attendance, page-parent, pickup acks) and the per-room admin
 * drill-down — without being checked in as a room volunteer?
 *
 * Owners/admins implicitly; everyone else needs the provisionable
 * `checkin_manager` permission flag (People → member → Access).
 * Server-side mirror: `hasClassroomOversight` in
 * `src/lib/server/classroom-oversight.ts`.
 */
export function canOverseeClassrooms(
  membership: Pick<Membership, "role" | "checkin_manager">,
): boolean {
  return (
    membership.role === "owner" ||
    membership.role === "admin" ||
    membership.checkin_manager === true
  );
}
