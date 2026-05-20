import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/admin/feedback/insights detail
 * to the new /dashboard/people/feedback/insights location (Phase 3a).
 */
export default function AdminFeedbackInsightsRedirect() {
  redirect("/dashboard/people/feedback/insights");
}
