"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

// Phase 3a: teams moved to /dashboard/people/teams.
// Phase 3b: billing moved to /dashboard/settings/billing.
// Phase 3c-i: check-ins moved to /dashboard/checkin/settings (reverse alias).
// Phase 3c-ii: campuses page split — `campuses` lands on Facility Groups
//   (highest-frequency landing); `rooms` lands on the now-real Rooms →
//   Settings page; campus-config lives in Settings → General.
const TAB_REDIRECTS: Record<string, string> = {
  teams: "/dashboard/people/teams",
  campuses: "/dashboard/rooms/facility",
  checkin: "/dashboard/checkin/settings",
  rooms: "/dashboard/rooms/settings",
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
