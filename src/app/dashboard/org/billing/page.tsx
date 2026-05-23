import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/org/billing location to the new
 * /dashboard/settings/billing home (Phase 3b route migration). Preserved
 * as an alias for existing email links, bookmarks, and the
 * /dashboard/organization?tab=billing redirect handler.
 */
export default function OrgBillingRedirect() {
  redirect("/dashboard/settings/billing");
}
