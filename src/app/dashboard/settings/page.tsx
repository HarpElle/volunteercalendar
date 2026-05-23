"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import type { OrgType, WorkflowMode, Church, Campus } from "@/lib/types";

import { GeneralSettings } from "@/components/settings/general-settings";
import { CampusesSettings } from "@/components/settings/campuses-settings";
import { SettingsShell } from "@/components/dashboard/settings-shell";

// ---------------------------------------------------------------------------
// Redirect legacy tab URLs to their new standalone pages
// ---------------------------------------------------------------------------

// Phase 3a: teams moved to /dashboard/people/teams.
// Phase 3b: billing moved to /dashboard/settings/billing.
// Phase 3c-i: check-ins moved to /dashboard/checkin/settings (reverse alias).
// Phase 3c-ii: campuses page split — Facility Groups → /dashboard/rooms/facility,
//   Room settings → /dashboard/rooms/settings, Campus config → here
//   (mounted as a section below General). `rooms` tab now lands on Rooms
//   → Settings; `campuses` tab lands on Facility Groups (highest-frequency).
const TAB_REDIRECTS: Record<string, string> = {
  teams: "/dashboard/people/teams",
  campuses: "/dashboard/rooms/facility",
  checkin: "/dashboard/checkin/settings",
  rooms: "/dashboard/rooms/settings",
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
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [campusesMutationError, setCampusesMutationError] = useState("");
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

  // Load church + campuses data
  useEffect(() => {
    if (!churchId) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const [churchSnap, campusDocs] = await Promise.all([
          getDoc(doc(db, "churches", churchId!)),
          getChurchDocuments(churchId!, "campuses"),
        ]);
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
        setCampuses(campusDocs as unknown as Campus[]);
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
      <div className="mx-auto max-w-5xl space-y-10">
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

        {/* Campus configuration — folded into General per plan §6.6.
            Phase 3c-ii moved this here from /dashboard/org/campuses
            (which now redirects to Rooms → Facility Groups). Multi-campus
            is a niche feature today; if it becomes common, this can be
            promoted to a dedicated Settings → Campuses tab. */}
        {churchId && (
          <section className="border-t border-vc-border-light pt-10">
            <header className="mb-4">
              <h2 className="font-display text-2xl text-vc-indigo">Campuses</h2>
              <p className="text-sm text-vc-text-secondary">
                Add and manage physical locations for multi-site organizations.
                Leave empty for single-location setups.
              </p>
            </header>
            {campusesMutationError && (
              <div className="mb-6 rounded-xl border border-vc-danger/20 bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
                {campusesMutationError}
              </div>
            )}
            <CampusesSettings
              churchId={churchId}
              campuses={campuses}
              setCampuses={setCampuses}
              mutationError={campusesMutationError}
              setMutationError={setCampusesMutationError}
            />
          </section>
        )}
      </div>
    </>
  );
}
