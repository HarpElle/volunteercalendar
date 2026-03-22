"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import { TabBar } from "@/components/ui/tab-bar";
import { isAdmin, isOwner } from "@/lib/utils/permissions";
import { getOrgTerms } from "@/lib/utils/org-terms";
import { TIER_LIMITS } from "@/lib/constants";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import type { Ministry, OrgType, WorkflowMode, Church, Volunteer, Campus } from "@/lib/types";

import { GeneralSettings } from "@/components/settings/general-settings";
import { TeamsSettings } from "@/components/settings/teams-settings";
import { CampusesSettings } from "@/components/settings/campuses-settings";
import { BillingSettings } from "@/components/settings/billing-settings";

type SettingsTab = "general" | "teams" | "campuses" | "billing";

const SETTINGS_TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: "general", label: "General" },
  { key: "teams", label: "Teams" },
  { key: "campuses", label: "Campuses" },
  { key: "billing", label: "Billing" },
];

export default function OrganizationPage() {
  return (
    <Suspense>
      <OrganizationContent />
    </Suspense>
  );
}

function OrganizationContent() {
  const { user, profile, activeMembership } = useAuth();
  const searchParams = useSearchParams();
  const churchId = activeMembership?.church_id || profile?.church_id;

  // ── Shared state ──────────────────────────────────────────────────────────
  const [church, setChurch] = useState<Church | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  // General settings state
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("church");
  const [orgTimezone, setOrgTimezone] = useState("America/New_York");
  const [orgWorkflowMode, setOrgWorkflowMode] = useState<WorkflowMode>("centralized");

  // Ministries state
  const [ministries, setMinistries] = useState<Ministry[]>([]);

  // Campuses state
  const [campuses, setCampuses] = useState<Campus[]>([]);

  // Shared mutation error (used by several tabs)
  const [mutationError, setMutationError] = useState("");

  // Billing state
  const [volunteerCount, setVolunteerCount] = useState(0);
  const [activeEventCount, setActiveEventCount] = useState(0);

  // Check-in settings state
  const [selfCheckInEnabled, setSelfCheckInEnabled] = useState(true);
  const [windowBefore, setWindowBefore] = useState(60);
  const [windowAfter, setWindowAfter] = useState(30);
  const [proximityEnabled, setProximityEnabled] = useState(false);
  const [proximityRadius, setProximityRadius] = useState(200);

  const billingSuccess = searchParams.get("success") === "true";
  const billingCanceled = searchParams.get("canceled") === "true";

  // ── Load all data ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!churchId) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const [churchSnap, minDocs, volDocs, eventDocs, campusDocs] = await Promise.all([
          getDoc(doc(db, "churches", churchId!)),
          getChurchDocuments(churchId!, "ministries"),
          getChurchDocuments(churchId!, "volunteers"),
          getChurchDocuments(churchId!, "events"),
          getChurchDocuments(churchId!, "campuses"),
        ]);
        if (churchSnap.exists()) {
          const data = churchSnap.data();
          const ch = { id: churchSnap.id, ...data } as unknown as Church;
          setChurch(ch);
          setOrgName(data.name || "");
          setOrgType((data.org_type as OrgType) || "church");
          setOrgTimezone(data.timezone || "America/New_York");
          setOrgWorkflowMode((data.workflow_mode as WorkflowMode) || "centralized");
          // Check-in settings
          const s = data.settings || {};
          setSelfCheckInEnabled(s.self_check_in_enabled !== false);
          setWindowBefore(s.check_in_window_before ?? 60);
          setWindowAfter(s.check_in_window_after ?? 30);
          setProximityEnabled(s.proximity_check_in_enabled === true);
          setProximityRadius(s.proximity_radius_meters ?? 200);
        }
        setMinistries(minDocs as unknown as Ministry[]);
        setCampuses(campusDocs as unknown as Campus[]);
        setVolunteerCount((volDocs as unknown as Volunteer[]).length);
        const events = eventDocs as unknown as { id: string; status?: string }[];
        setActiveEventCount(
          events.filter((e) => !e.status || e.status === "active" || e.status === "draft").length
        );
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  // ── Derived values ────────────────────────────────────────────────────────
  const terms = getOrgTerms(orgType);
  const currentTier = church?.subscription_tier || "free";
  const limits = TIER_LIMITS[currentTier] || TIER_LIMITS.free;
  const ministryLimitReached =
    limits.ministries !== Infinity && ministries.length >= limits.ministries;
  const isPlatformSuperadmin = (() => {
    const uids = (process.env.NEXT_PUBLIC_PLATFORM_ADMIN_UIDS || "")
      .split(",")
      .map((s) => s.trim());
    return user ? uids.includes(user.uid) : false;
  })();

  // Filter visible tabs based on role
  const visibleTabs = SETTINGS_TABS.filter((tab) => {
    if (tab.key === "campuses") return isAdmin(activeMembership);
    if (tab.key === "billing") return isOwner(activeMembership) || isPlatformSuperadmin;
    return true;
  });

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Organization</h1>
        <p className="mt-1 text-vc-text-secondary">
          Manage your {orgType === "church" ? "church" : "organization"} settings,{" "}
          {terms.pluralLower}, and billing.
        </p>
      </div>

      {mutationError && (
        <div className="mb-6 rounded-xl border border-vc-danger/20 bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
          {mutationError}
        </div>
      )}

      <TabBar
        tabs={visibleTabs}
        active={activeTab}
        onChange={setActiveTab}
        variant="underline"
        className="mb-8"
      />

      {activeTab === "general" && church && (
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
          selfCheckInEnabled={selfCheckInEnabled}
          setSelfCheckInEnabled={setSelfCheckInEnabled}
          windowBefore={windowBefore}
          setWindowBefore={setWindowBefore}
          windowAfter={windowAfter}
          setWindowAfter={setWindowAfter}
          proximityEnabled={proximityEnabled}
          setProximityEnabled={setProximityEnabled}
          proximityRadius={proximityRadius}
          setProximityRadius={setProximityRadius}
          campuses={campuses}
          user={user}
          activeMembership={activeMembership}
        />
      )}

      {activeTab === "teams" && (
        <TeamsSettings
          churchId={churchId!}
          ministries={ministries}
          setMinistries={setMinistries}
          ministryLimitReached={ministryLimitReached}
          terms={terms}
          currentTier={currentTier}
          shortLinksLimit={limits.short_links}
          mutationError={mutationError}
          setMutationError={setMutationError}
          user={user}
          activeMembership={activeMembership}
        />
      )}

      {activeTab === "campuses" && isAdmin(activeMembership) && (
        <CampusesSettings
          churchId={churchId!}
          campuses={campuses}
          setCampuses={setCampuses}
          mutationError={mutationError}
          setMutationError={setMutationError}
        />
      )}

      {activeTab === "billing" && church && (
        <BillingSettings
          churchId={churchId!}
          church={church}
          setChurch={setChurch}
          currentTier={currentTier}
          volunteerCount={volunteerCount}
          activeEventCount={activeEventCount}
          ministriesCount={ministries.length}
          terms={terms}
          isPlatformSuperadmin={isPlatformSuperadmin}
          mutationError={mutationError}
          setMutationError={setMutationError}
          activeMembership={activeMembership}
          billingSuccess={billingSuccess}
          billingCanceled={billingCanceled}
        />
      )}
    </div>
  );
}
