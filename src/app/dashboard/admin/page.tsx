import { redirect } from "next/navigation";

/**
 * Redirect from the legacy /dashboard/admin location (a platform-admin
 * tier-override utility used by super-admins for testing tier-gated
 * behavior) to the new self-documenting /dashboard/platform/tier-override
 * URL (Phase 3d route migration).
 *
 * No sidebar entry references this — it's an orphaned utility only known
 * to platform admins. Redirect preserved for any internal bookmarks.
 */
export default function AdminRedirect() {
  redirect("/dashboard/platform/tier-override");
}
