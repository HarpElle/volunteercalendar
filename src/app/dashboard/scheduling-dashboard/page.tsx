import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/scheduling-dashboard location to the
 * new /dashboard/service-day home (Phase 3d route rename — "Service Day"
 * is the IA Pass A canonical name for the day-of operations view).
 *
 * Preserved as an alias for outbound email links (absence-alert,
 * self-removal-alert) and any in-flight bookmarks. Email templates were
 * updated to point at the new URL in the same PR.
 */
export default function SchedulingDashboardRedirect() {
  redirect("/dashboard/service-day");
}
