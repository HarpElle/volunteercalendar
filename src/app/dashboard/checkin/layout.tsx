"use client";

import { ModuleTabs, type ModuleTab } from "@/components/dashboard/module-tabs";
import { TierGateBoundary } from "@/components/dashboard/tier-gate-boundary";
import { canAccessCheckin } from "@/lib/utils/checkin-permissions";

const CHECKIN_ICON =
  "M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z";

const CHECKIN_TABS: ModuleTab[] = [
  { id: "today", label: "Today", href: "/dashboard/checkin" },
  { id: "households", label: "Households", href: "/dashboard/checkin/households" },
  { id: "reports", label: "Reports", href: "/dashboard/checkin/reports" },
  { id: "room-setup", label: "Room Setup", href: "/dashboard/checkin/rooms" },
  { id: "import", label: "Import", href: "/dashboard/checkin/import" },
];

/**
 * Check-In module layout.
 *
 * Wrapped in <TierGateBoundary module="checkin"> so Free/Starter visitors
 * who hit /dashboard/checkin or any of its sub-routes directly see an
 * upgrade-prompt screen instead of the actual Check-In functionality.
 * Sidebar / More-menu lock badges continue to work the same way; this is
 * the URL-level enforcement that Codex Pass A retest flagged as missing.
 *
 * Note: /dashboard/checkin/settings is the org-admin tab settings UI
 * (Volunteers / Children / Stations). It is also gated by this boundary
 * — Free orgs cannot reach Check-In settings either.
 */
export default function CheckinLayout({ children }: { children: React.ReactNode }) {
  // sr-only h1 with active tab is rendered INSIDE <ModuleTabs>.
  return (
    // allowWhen lets check-in flag-holders (checkin_volunteer / checkin_manager)
    // who are plain volunteers enter the module — the default role gate is
    // scheduler+ (Codex P3-8). Tier still gates Free/Starter orgs.
    <TierGateBoundary
      module="checkin"
      allowWhen={(m) => !!m && canAccessCheckin(m)}
    >
      <ModuleTabs
        moduleLabel="Check-In"
        moduleIconPath={CHECKIN_ICON}
        tabs={CHECKIN_TABS}
      />
      {children}
    </TierGateBoundary>
  );
}
