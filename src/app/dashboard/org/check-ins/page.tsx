import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/org/check-ins location to the new
 * /dashboard/checkin/settings home (Phase 3c-i route migration; reverse
 * alias — previously /dashboard/checkin/settings redirected here, now
 * the relationship is inverted).
 *
 * Preserved as an alias for the /dashboard/organization?tab=checkin
 * redirect handler and any in-app links that still point at the old
 * /dashboard/org/check-ins URL.
 *
 * Note: this redirect drops any `?tab=` query param. Internal links from
 * /dashboard/checkin/page.tsx that used /dashboard/org/check-ins?tab=X
 * have been updated to point at /dashboard/checkin/settings directly.
 */
export default function OrgCheckInsRedirect() {
  redirect("/dashboard/checkin/settings");
}
