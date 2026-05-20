import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/training-sessions location to the
 * new /dashboard/people/training home (Phase 3a route migration).
 * Preserves any `?status=...` query params for back-navigation flows
 * (e.g. /dashboard/people/training/[id] redirecting after a Cancel).
 */
export default async function TrainingSessionsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const qs = params.status ? `?status=${encodeURIComponent(params.status)}` : "";
  redirect(`/dashboard/people/training${qs}`);
}
