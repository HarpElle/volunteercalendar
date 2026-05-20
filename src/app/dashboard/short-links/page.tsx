import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/short-links location to the new
 * /dashboard/settings/short-links home (Phase 3b route migration). Preserved
 * as an alias for existing email links and bookmarks.
 */
export default function ShortLinksRedirect() {
  redirect("/dashboard/settings/short-links");
}
