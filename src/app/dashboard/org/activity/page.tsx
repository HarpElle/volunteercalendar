import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/org/activity location to the new
 * /dashboard/settings/activity home (Phase 3b route migration). Preserved
 * as an alias for existing email links and bookmarks.
 */
export default function OrgActivityRedirect() {
  redirect("/dashboard/settings/activity");
}
