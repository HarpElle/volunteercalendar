"use client";

import { ModuleTabs, type ModuleTab } from "@/components/dashboard/module-tabs";

const PEOPLE_ICON =
  "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z";

/** People module tabs. Phase 3a migrated all sub-pages into /dashboard/people/*.
 *  Old URLs (e.g. /dashboard/onboarding, /dashboard/org/teams) still work via
 *  redirects in their original locations. */
const PEOPLE_TABS: ModuleTab[] = [
  { id: "roster", label: "Roster", href: "/dashboard/people" },
  { id: "teams", label: "Teams", href: "/dashboard/people/teams" },
  { id: "onboarding", label: "Onboarding", href: "/dashboard/people/onboarding" },
  { id: "training", label: "Training", href: "/dashboard/people/training" },
  { id: "health", label: "Health", href: "/dashboard/people/health" },
  { id: "retention", label: "Retention", href: "/dashboard/people/retention" },
  { id: "feedback", label: "Feedback", href: "/dashboard/people/feedback" },
];

export function PeopleShell({ actions }: { actions?: React.ReactNode }) {
  // sr-only h1 with active tab is rendered INSIDE <ModuleTabs>.
  return (
    <ModuleTabs
      moduleLabel="People"
      moduleIconPath={PEOPLE_ICON}
      tabs={PEOPLE_TABS}
      actions={actions}
    />
  );
}
