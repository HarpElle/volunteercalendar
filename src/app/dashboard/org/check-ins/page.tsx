import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/org/check-ins location to the new
 * /dashboard/checkin/settings home (Phase 3c-i reverse alias).
 *
 * Preserves any `?tab=...` query param so deep links like
 * /dashboard/org/check-ins?tab=stations and ?tab=children land on the
 * correct settings tab (Phase 3c-i retest Finding 1).
 *
 * Preserved as an alias for the /dashboard/organization?tab=checkin
 * redirect handler and any in-app links that still point at the old
 * /dashboard/org/check-ins URL.
 */
export default async function OrgCheckInsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const qs = params.tab ? `?tab=${encodeURIComponent(params.tab)}` : "";
  redirect(`/dashboard/checkin/settings${qs}`);
}
