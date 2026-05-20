import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/admin/feedback location to the new
 * /dashboard/people/feedback home (Phase 3a route migration; Feedback
 * Triage resolved to People per Jason's adjudication 2026-05-19).
 */
export default function AdminFeedbackRedirect() {
  redirect("/dashboard/people/feedback");
}
