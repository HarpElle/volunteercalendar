import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/onboarding location to the new
 * /dashboard/people/onboarding home (Phase 3a route migration). Preserved
 * as an alias for existing email links, bookmarks, and tester docs.
 */
export default function OnboardingRedirect() {
  redirect("/dashboard/people/onboarding");
}
