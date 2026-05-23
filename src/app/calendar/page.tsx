import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /calendar location to the new
 * /dashboard/rooms/calendar home (Phase 3c-i route migration).
 *
 * /calendar/public (the public token-protected calendar feed) is a
 * separate route that lives at /calendar/public/page.tsx and is NOT
 * affected by this redirect.
 */
export default function CalendarRedirect() {
  redirect("/dashboard/rooms/calendar");
}
