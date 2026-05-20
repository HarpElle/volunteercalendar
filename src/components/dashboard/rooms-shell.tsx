"use client";

import { ModuleTabs, type ModuleTab } from "@/components/dashboard/module-tabs";

const ROOMS_ICON =
  "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21";

/** Rooms module tabs. /dashboard/org/campuses points to the Facility Groups
 *  tab destination during the Phase 2 → Phase 3 transition; Phase 3 splits
 *  /org/campuses across Facility Groups + Settings + Calendar per plan §6.6.
 *  A dedicated Rooms → Settings tab will reappear in Phase 3 once
 *  /dashboard/rooms/settings becomes a real surface (it currently redirects
 *  to /dashboard/org/campuses, so we'd be adding a tab that just bounces). */
const ROOMS_TABS: ModuleTab[] = [
  { id: "bookings", label: "Bookings", href: "/dashboard/rooms" },
  { id: "requests", label: "Requests", href: "/dashboard/rooms/requests" },
  { id: "facility", label: "Facility Groups", href: "/dashboard/org/campuses" },
];

export function RoomsShell({ actions }: { actions?: React.ReactNode }) {
  // sr-only h1 with active tab is rendered INSIDE <ModuleTabs>.
  return (
    <ModuleTabs
      moduleLabel="Rooms"
      moduleIconPath={ROOMS_ICON}
      tabs={ROOMS_TABS}
      actions={actions}
    />
  );
}
