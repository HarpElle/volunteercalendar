"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

// Phase 3a: teams moved to /dashboard/people/teams.
// Phase 3b: billing moved to /dashboard/settings/billing.
// campuses and check-ins still pending Phase 3c.
const TAB_REDIRECTS: Record<string, string> = {
  teams: "/dashboard/people/teams",
  campuses: "/dashboard/org/campuses",
  checkin: "/dashboard/org/check-ins",
  rooms: "/dashboard/org/campuses",
  billing: "/dashboard/settings/billing",
};

function RedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    const target = (tab && TAB_REDIRECTS[tab]) || "/dashboard/settings";
    router.replace(target);
  }, [router, searchParams]);

  return null;
}

export default function OrganizationRedirect() {
  return (
    <Suspense>
      <RedirectContent />
    </Suspense>
  );
}
