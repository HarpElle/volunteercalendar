"use client";

import { ModuleTabs, type ModuleTab } from "@/components/dashboard/module-tabs";
import { TierGateBoundary } from "@/components/dashboard/tier-gate-boundary";

const WORSHIP_ICON =
  "m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z";

const WORSHIP_TABS: ModuleTab[] = [
  { id: "plans", label: "Service Plans", href: "/dashboard/worship/plans" },
  { id: "songs", label: "Songs", href: "/dashboard/worship/songs" },
  { id: "reports", label: "Reports", href: "/dashboard/worship/reports" },
];

/**
 * Worship Prep module layout.
 *
 * Wrapped in <TierGateBoundary module="worship"> so Free/Starter visitors
 * who hit /dashboard/worship or any of its sub-routes directly see an
 * upgrade-prompt screen instead of the actual Worship Prep functionality.
 * Sidebar / More-menu lock badges continue to work the same way; this is
 * the URL-level enforcement that Codex Pass A retest flagged as missing.
 */
export default function WorshipLayout({ children }: { children: React.ReactNode }) {
  // sr-only h1 with active tab is rendered INSIDE <ModuleTabs> for an
  // accessible page identity like "Worship Prep — Service Plans".
  return (
    <TierGateBoundary module="worship">
      <ModuleTabs
        moduleLabel="Worship Prep"
        moduleIconPath={WORSHIP_ICON}
        tabs={WORSHIP_TABS}
      />
      {children}
    </TierGateBoundary>
  );
}
