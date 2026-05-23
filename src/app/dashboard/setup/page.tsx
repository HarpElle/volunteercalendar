import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/setup location to the new
 * /dashboard/settings/setup home (Phase 3b route migration).
 * Preserves any `?mode=new` query param used by /dashboard/my-orgs
 * to launch the setup wizard for additional orgs.
 */
export default async function SetupRedirect({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const qs = params.mode ? `?mode=${encodeURIComponent(params.mode)}` : "";
  redirect(`/dashboard/settings/setup${qs}`);
}
