"use client";

import { ModuleTabs, type ModuleTab } from "@/components/dashboard/module-tabs";

const SCHEDULES_ICON =
  "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5";

const SCHEDULES_TABS: ModuleTab[] = [
  { id: "all", label: "All Schedules", href: "/dashboard/schedules" },
  { id: "services-events", label: "Services & Events", href: "/dashboard/schedules/services-events" },
];

/** Shell for the Schedules module. Render at the top of /dashboard/schedules
 *  and /dashboard/schedules/services-events so the tab strip is consistent
 *  across both. Phase 3d moved services-events into /dashboard/schedules/* */
export function SchedulesShell({ actions }: { actions?: React.ReactNode }) {
  // sr-only h1 is rendered INSIDE <ModuleTabs> so it can include the
  // active tab text (e.g. "Schedules — Services & Events"). Don't add
  // another h1 here.
  return (
    <ModuleTabs
      moduleLabel="Schedules"
      moduleIconPath={SCHEDULES_ICON}
      tabs={SCHEDULES_TABS}
      actions={actions}
    />
  );
}
