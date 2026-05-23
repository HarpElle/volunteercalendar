"use client";

import { ModuleTabs, type ModuleTab } from "@/components/dashboard/module-tabs";

const ROOMS_ICON =
  "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21";

/** Rooms module tabs. Phase 3c-i adds Calendar (now lives at
 *  /dashboard/rooms/calendar after moving from /calendar). Facility Groups
 *  still points at /dashboard/org/campuses pending Phase 3c-ii's 3-way
 *  split of that page per plan §6.6 (campuses-config → Settings, rooms-
 *  settings → /dashboard/rooms/settings, facility-sharing →
 *  /dashboard/rooms/facility). A dedicated Rooms → Settings tab will
 *  reappear in 3c-ii once /dashboard/rooms/settings becomes a real surface
 *  (it currently redirects to /dashboard/org/campuses). */
const ROOMS_TABS: ModuleTab[] = [
  { id: "bookings", label: "Bookings", href: "/dashboard/rooms" },
  { id: "calendar", label: "Calendar", href: "/dashboard/rooms/calendar" },
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
