import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/retention location to the new
 * /dashboard/people/retention home (Phase 3a route migration).
 */
export default function RetentionRedirect() {
  redirect("/dashboard/people/retention");
}
