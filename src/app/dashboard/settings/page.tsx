"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import type { OrgType, WorkflowMode, Church, Campus } from "@/lib/types";

import {
  GeneralSettings,
  CcliLicenseSection,
  DeleteOrgSection,
} from "@/components/settings/general-settings";
import { CampusesSettings } from "@/components/settings/campuses-settings";
import { SecuritySection } from "@/components/settings/security-section";
import { BrandingSection } from "@/components/settings/branding-section";
import { SettingsShell } from "@/components/dashboard/settings-shell";
import { isAdmin, isOwner } from "@/lib/utils/permissions";

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
      {/* Section order matters: General → Campuses → CCLI → Danger Zone.
          Phase 4 restructured this so the parent page controls ordering;
          previously CCLI + Danger Zone were rendered inline at the bottom
          of <GeneralSettings>, which pushed the Phase 3c-ii Campuses
          section below Danger Zone (Codex 3c-ii retest visual note). */}
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

        {/* Wave 11 Org Branding — admin-only. Sits between Campuses
            and CCLI for natural "identity" grouping (church name, logo,
            CCLI license number all belong together). */}
        {church && churchId && isAdmin(activeMembership) && (
          <section className="border-t border-vc-border-light pt-10">
            <BrandingSection
              churchId={churchId}
              currentLogoUrl={church.logo_url ?? null}
              onChange={(newLogoUrl) =>
                setChurch({ ...church, logo_url: newLogoUrl })
              }
            />
          </section>
        )}

        {/* CCLI License — admin-only, sits between Campuses and Danger Zone */}
        {church && isAdmin(activeMembership) && (
          <CcliLicenseSection
            churchId={churchId!}
            church={church}
            setChurch={setChurch}
          />
        )}

        {/* Security — admin-only. Pass G Phase 3 added the bulk
            calendar-feed rotation action here. */}
        {churchId && isAdmin(activeMembership) && (
          <SecuritySection churchId={churchId} user={user} />
        )}

        {/* About VolunteerCal — visible to everyone in the org.
            Wave 4.4 added /status and /changelog pages; this section
            surfaces them so admins / leads don't have to discover
            those URLs from outside the app. */}
        <section className="rounded-2xl border border-vc-border-light bg-white p-6">
          <h2 className="font-display text-xl font-semibold text-vc-indigo">
            About VolunteerCal
          </h2>
          <p className="mt-2 text-sm text-vc-text-secondary">
            Operational health and what&apos;s shipping.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-3">
            <a
              href="/status"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-vc-border-light bg-vc-bg-warm px-4 py-2 text-sm font-medium text-vc-indigo hover:bg-vc-sand/40"
            >
              System Status
              <svg
                className="h-3.5 w-3.5 text-vc-text-muted"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
            </a>
            <a
              href="/changelog"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-vc-border-light bg-vc-bg-warm px-4 py-2 text-sm font-medium text-vc-indigo hover:bg-vc-sand/40"
            >
              Changelog
              <svg
                className="h-3.5 w-3.5 text-vc-text-muted"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
            </a>
          </div>
        </section>

        {/* Danger Zone — owner-only, always last */}
        {isOwner(activeMembership) && churchId && (
          <DeleteOrgSection churchId={churchId} orgName={orgName} user={user} />
        )}
      </div>
    </>
  );
}
