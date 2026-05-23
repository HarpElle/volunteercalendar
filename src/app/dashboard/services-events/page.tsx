import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/services-events location to the new
 * /dashboard/schedules/services-events home (Phase 3d route migration).
 *
 * Services & Events is the Schedules module's sister tab — moving it under
 * /dashboard/schedules/* keeps Schedule module navigation consistent.
 * Preserved as an alias for existing email links, bookmarks, and the
 * SchedulesShell tab fallback during the transition.
 */
export default function ServicesEventsRedirect() {
  redirect("/dashboard/schedules/services-events");
}
