import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/training-sessions/[id] detail page
 * to the new /dashboard/people/training/[id] location (Phase 3a).
 */
export default async function TrainingSessionDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/people/training/${id}`);
}
