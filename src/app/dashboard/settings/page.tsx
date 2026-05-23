"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import type { OrgType, WorkflowMode, Church } from "@/lib/types";

import { GeneralSettings } from "@/components/settings/general-settings";
import { SettingsShell } from "@/components/dashboard/settings-shell";

// ---------------------------------------------------------------------------
// Redirect legacy tab URLs to their new standalone pages
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Page wrapper (Suspense boundary for useSearchParams)
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function SettingsContent() {
  const { user, profile, activeMembership } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [church, setChurch] = useState<Church | null>(null);
  const [loading, setLoading] = useState(true);

  // General settings state
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("church");
  const [orgTimezone, setOrgTimezone] = useState("America/New_York");
  const [orgWorkflowMode, setOrgWorkflowMode] = useState<WorkflowMode>(
    "centralized",
  );

  // Redirect legacy tab URLs to new standalone pages
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && TAB_REDIRECTS[tab]) {
      router.replace(TAB_REDIRECTS[tab]);
    }
  }, [searchParams, router]);

  // Load church data
  useEffect(() => {
    if (!churchId) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const churchSnap = await getDoc(doc(db, "churches", churchId!));
        if (churchSnap.exists()) {
          const data = churchSnap.data();
          const ch = { id: churchSnap.id, ...data } as unknown as Church;
          setChurch(ch);
          setOrgName(data.name || "");
          setOrgType((data.org_type as OrgType) || "church");
          setOrgTimezone(data.timezone || "America/New_York");
          setOrgWorkflowMode(
            (data.workflow_mode as WorkflowMode) || "centralized",
          );
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <SettingsShell />
      <div className="mx-auto max-w-5xl">
        {church && (
          <GeneralSettings
            churchId={churchId!}
            church={church}
            setChurch={setChurch}
            orgName={orgName}
            setOrgName={setOrgName}
            orgType={orgType}
            setOrgType={setOrgType}
            orgTimezone={orgTimezone}
            setOrgTimezone={setOrgTimezone}
            orgWorkflowMode={orgWorkflowMode}
            user={user}
            activeMembership={activeMembership}
          />
        )}
      </div>
    </>
  );
}
