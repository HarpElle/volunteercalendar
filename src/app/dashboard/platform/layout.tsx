"use client";

import { PlatformAdminBoundary } from "@/components/dashboard/platform-admin-boundary";

/**
 * /dashboard/platform/* layout. Gates the entire subtree behind the
 * platform-admin claim (env-var-backed UID whitelist via /api/platform/me).
 *
 * Pass G Phase 6 hotfix: previously /dashboard/platform/tier-override and
 * sibling pages had no URL-level gate — Codex found Alex (volunteer) could
 * load the page even though the underlying API call would 403. Now
 * blocked at the layout.
 */
export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PlatformAdminBoundary>{children}</PlatformAdminBoundary>;
}
