import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/volunteer-health location to the
 * new /dashboard/people/health home (Phase 3a route migration).
 */
export default function VolunteerHealthRedirect() {
  redirect("/dashboard/people/health");
}
