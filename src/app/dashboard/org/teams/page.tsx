import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/org/teams location to the new
 * /dashboard/people/teams home (Phase 3a route migration). Preserved as
 * an alias so existing email links, browser bookmarks, and tester docs
 * keep working. Safe to delete once external references are confirmed
 * to be updated (likely Phase 4 cleanup).
 */
export default function OrgTeamsRedirect() {
  redirect("/dashboard/people/teams");
}
