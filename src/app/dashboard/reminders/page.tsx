import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/reminders location to the new
 * /dashboard/settings/reminders home (Phase 3b route migration). Preserved
 * as an alias for existing email links and bookmarks.
 */
export default function RemindersRedirect() {
  redirect("/dashboard/settings/reminders");
}
