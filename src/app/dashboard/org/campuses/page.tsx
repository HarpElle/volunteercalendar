import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/org/campuses location to the new
 * /dashboard/rooms/facility home (Phase 3c-ii route split).
 *
 * The 597-line campuses page mixed 3 concerns; Phase 3c-ii dissolved them
 * across 3 destinations per plan §6.6:
 *
 *  - Campus configuration → /dashboard/settings (mounted as a section
 *    inside Settings → General)
 *  - Room settings (tags, booking defaults, public calendar) →
 *    /dashboard/rooms/settings
 *  - Facility Groups (cross-org sharing) → /dashboard/rooms/facility
 *
 * This redirect lands on Facility Groups because that's the
 * highest-frequency reason testers hit the old URL (per plan §6.6).
 * Email templates and the /dashboard/organization?tab=campuses handler
 * have been updated to target Facility Groups directly.
 */
export default function CampusesRedirect() {
  redirect("/dashboard/rooms/facility");
}
