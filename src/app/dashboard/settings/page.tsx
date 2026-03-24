"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import {
  getChurchDocuments,
  getChurchFacilityGroups,
  getFacilityGroupMembers,
  createFacilityGroup,
  inviteToFacilityGroup,
  acceptFacilityInvite,
  leaveFacilityGroup,
} from "@/lib/firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabBar } from "@/components/ui/tab-bar";
import { isAdmin, isOwner } from "@/lib/utils/permissions";
import { getOrgTerms } from "@/lib/utils/org-terms";
import { TIER_LIMITS } from "@/lib/constants";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import type {
  Ministry,
  OrgType,
  WorkflowMode,
  Church,
  Volunteer,
  Campus,
  FacilityGroup,
  FacilityGroupMember,
} from "@/lib/types";

import { GeneralSettings } from "@/components/settings/general-settings";
import { TeamsSettings } from "@/components/settings/teams-settings";
import { CampusesSettings } from "@/components/settings/campuses-settings";
import { BillingSettings } from "@/components/settings/billing-settings";

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------

type SettingsTab =
  | "general"
  | "teams"
  | "campuses"
  | "checkin"
  | "rooms"
  | "billing";

const ALL_TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: "general", label: "General" },
  { key: "teams", label: "Teams" },
  { key: "campuses", label: "Campuses" },
  { key: "checkin", label: "Check-In" },
  { key: "rooms", label: "Rooms" },
  { key: "billing", label: "Billing" },
];

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
  const churchId = activeMembership?.church_id || profile?.church_id;

  // ── Shared state ──────────────────────────────────────────────────────
  const [church, setChurch] = useState<Church | null>(null);
  const [loading, setLoading] = useState(true);
  const initialTab = (searchParams.get("tab") as SettingsTab) || "general";
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // General settings state
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("church");
  const [orgTimezone, setOrgTimezone] = useState("America/New_York");
  const [orgWorkflowMode, setOrgWorkflowMode] = useState<WorkflowMode>(
    "centralized",
  );

  // Ministries state
  const [ministries, setMinistries] = useState<Ministry[]>([]);

  // Campuses state
  const [campuses, setCampuses] = useState<Campus[]>([]);

  // Shared mutation error
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

  // ── Load all data ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!churchId) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const [churchSnap, minDocs, volDocs, eventDocs, campusDocs] =
          await Promise.all([
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
          setOrgWorkflowMode(
            (data.workflow_mode as WorkflowMode) || "centralized",
          );
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
        const events = eventDocs as unknown as {
          id: string;
          status?: string;
        }[];
        setActiveEventCount(
          events.filter(
            (e) =>
              !e.status || e.status === "active" || e.status === "draft",
          ).length,
        );
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  // ── Derived values ────────────────────────────────────────────────────
  const terms = getOrgTerms(orgType);
  const currentTier = church?.subscription_tier || "free";
  const limits = TIER_LIMITS[currentTier] || TIER_LIMITS.free;
  const checkinEnabled = limits.checkin_enabled ?? false;
  const roomsEnabled = limits.rooms_enabled ?? false;
  const ministryLimitReached =
    limits.ministries !== Infinity && ministries.length >= limits.ministries;
  const isPlatformSuperadmin = (() => {
    const uids = (process.env.NEXT_PUBLIC_PLATFORM_ADMIN_UIDS || "")
      .split(",")
      .map((s) => s.trim());
    return user ? uids.includes(user.uid) : false;
  })();

  // Filter visible tabs based on role and tier
  const visibleTabs = ALL_TABS.filter((tab) => {
    if (tab.key === "campuses") return isAdmin(activeMembership);
    if (tab.key === "billing")
      return isOwner(activeMembership) || isPlatformSuperadmin;
    if (tab.key === "checkin") return checkinEnabled && isAdmin(activeMembership);
    if (tab.key === "rooms") return roomsEnabled && isAdmin(activeMembership);
    return true;
  });

  // ── Loading state ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Organization Settings</h1>
        <p className="mt-1 text-vc-text-secondary">
          Manage {orgName || (orgType === "church" ? "your church" : "your organization")}{" "}
          settings, {terms.pluralLower}, and billing.
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

      {activeTab === "checkin" && checkinEnabled && (
        <CheckInSettingsTab
          churchId={churchId!}
          guardianSmsEnabled={limits.checkin_guardian_sms ?? false}
        />
      )}

      {activeTab === "rooms" && roomsEnabled && (
        <RoomsSettingsTab churchId={churchId!} />
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

// ---------------------------------------------------------------------------
// Check-In Settings Tab (inline)
// ---------------------------------------------------------------------------

function CheckInSettingsTab({
  churchId,
  guardianSmsEnabled,
}: {
  churchId: string;
  guardianSmsEnabled: boolean;
}) {
  const { user } = useAuth();
  const [thresholds, setThresholds] = useState({
    pre_checkin_window_minutes: 30,
    late_arrival_threshold_minutes: 15,
    capacity_sms_recipient_phone: "",
    guardian_sms_on_checkin: false,
    guardian_sms_on_checkout: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch(
          `/api/admin/checkin/settings?church_id=${churchId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const data = await res.json();
          setThresholds({
            pre_checkin_window_minutes:
              data.pre_checkin_window_minutes ?? 30,
            late_arrival_threshold_minutes:
              data.late_arrival_threshold_minutes ?? 15,
            capacity_sms_recipient_phone:
              data.capacity_sms_recipient_phone ?? "",
            guardian_sms_on_checkin:
              data.guardian_sms_on_checkin ?? false,
            guardian_sms_on_checkout:
              data.guardian_sms_on_checkout ?? false,
          });
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, churchId]);

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/checkin/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ church_id: churchId, ...thresholds }),
      });
      if (res.ok) {
        setSaved(true);
        if (savedTimeout.current) clearTimeout(savedTimeout.current);
        savedTimeout.current = setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [user, churchId, thresholds]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
        <h2 className="mb-1 font-display text-lg text-vc-indigo">
          Check-In Thresholds
        </h2>
        <p className="mb-4 text-sm text-vc-text-secondary">
          Configure timing windows for the check-in process.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
              Pre-check-in window (minutes)
            </label>
            <input
              type="number"
              min={5}
              max={120}
              value={thresholds.pre_checkin_window_minutes}
              onChange={(e) =>
                setThresholds((t) => ({
                  ...t,
                  pre_checkin_window_minutes: parseInt(e.target.value, 10) || 30,
                }))
              }
              className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
              Late arrival threshold (minutes)
            </label>
            <input
              type="number"
              min={5}
              max={60}
              value={thresholds.late_arrival_threshold_minutes}
              onChange={(e) =>
                setThresholds((t) => ({
                  ...t,
                  late_arrival_threshold_minutes:
                    parseInt(e.target.value, 10) || 15,
                }))
              }
              className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
              Capacity SMS recipient phone (E.164)
            </label>
            <input
              type="tel"
              value={thresholds.capacity_sms_recipient_phone}
              onChange={(e) =>
                setThresholds((t) => ({
                  ...t,
                  capacity_sms_recipient_phone: e.target.value,
                }))
              }
              placeholder="+15551234567"
              className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
            />
          </div>
        </div>
      </section>

      {/* Guardian SMS Notifications */}
      <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
        <h2 className="mb-1 font-display text-lg text-vc-indigo">
          Guardian SMS Notifications
        </h2>
        <p className="mb-4 text-sm text-vc-text-secondary">
          Send text messages to the primary guardian when children are checked in or out.
        </p>

        {guardianSmsEnabled ? (
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm font-medium text-vc-text">
              <input
                type="checkbox"
                checked={thresholds.guardian_sms_on_checkin}
                onChange={(e) =>
                  setThresholds((t) => ({
                    ...t,
                    guardian_sms_on_checkin: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-vc-border-light text-vc-coral accent-vc-coral"
              />
              SMS on check-in
              <span className="text-xs font-normal text-vc-text-muted">
                — Includes child name, room, and security code
              </span>
            </label>
            <label className="flex items-center gap-3 text-sm font-medium text-vc-text">
              <input
                type="checkbox"
                checked={thresholds.guardian_sms_on_checkout}
                onChange={(e) =>
                  setThresholds((t) => ({
                    ...t,
                    guardian_sms_on_checkout: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-vc-border-light text-vc-coral accent-vc-coral"
              />
              SMS on checkout
              <span className="text-xs font-normal text-vc-text-muted">
                — Confirms child has been picked up
              </span>
            </label>
          </div>
        ) : (
          <p className="rounded-lg bg-vc-sand/20 px-3 py-2 text-sm text-vc-text-muted">
            Guardian SMS is available on Growth plans and above.
          </p>
        )}
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saving}>
          Save Check-In Settings
        </Button>
        {saved && <Badge variant="success">Saved</Badge>}
      </div>

      {/* Room Configuration link */}
      <section className="mt-8 rounded-xl border border-vc-border-light bg-vc-bg-warm p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-vc-indigo">
              Room Configuration
            </h3>
            <p className="mt-0.5 text-xs text-vc-text-secondary">
              Set grade ranges, capacity limits, and overflow routing for
              children&apos;s check-in rooms.
            </p>
          </div>
          <a
            href="/dashboard/checkin/rooms"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-vc-indigo shadow-sm ring-1 ring-vc-border-light transition-colors hover:bg-vc-bg"
          >
            Configure Rooms
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </a>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rooms Settings Tab (inline)
// ---------------------------------------------------------------------------

interface RoomSettings {
  equipment_tags: string[];
  require_approval: boolean;
  max_advance_days: number;
  default_setup_minutes: number;
  default_teardown_minutes: number;
  public_calendar_enabled: boolean;
  public_calendar_token: string;
}

const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  equipment_tags: [],
  require_approval: false,
  max_advance_days: 90,
  default_setup_minutes: 15,
  default_teardown_minutes: 15,
  public_calendar_enabled: false,
  public_calendar_token: "",
};

function RoomsSettingsTab({ churchId }: { churchId: string }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newTag, setNewTag] = useState("");
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch(
          `/api/rooms/settings?church_id=${churchId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const data = await res.json();
          setSettings({ ...DEFAULT_ROOM_SETTINGS, ...data });
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, churchId]);

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/rooms/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ church_id: churchId, ...settings }),
      });
      if (res.ok) {
        setSaved(true);
        if (savedTimeout.current) clearTimeout(savedTimeout.current);
        savedTimeout.current = setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [user, churchId, settings]);

  function addTag() {
    const tag = newTag.trim();
    if (!tag || settings.equipment_tags.includes(tag)) return;
    setSettings((s) => ({
      ...s,
      equipment_tags: [...s.equipment_tags, tag],
    }));
    setNewTag("");
  }

  function removeTag(tag: string) {
    setSettings((s) => ({
      ...s,
      equipment_tags: s.equipment_tags.filter((t) => t !== tag),
    }));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Equipment Tags */}
      <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
        <h2 className="mb-1 font-display text-lg text-vc-indigo">
          Equipment Tags
        </h2>
        <p className="mb-4 text-sm text-vc-text-secondary">
          Tags that can be assigned to rooms for filtering.
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          {settings.equipment_tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 rounded-full bg-vc-sand/25 px-3 py-1 text-sm text-vc-text"
            >
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="text-vc-text-muted hover:text-vc-danger"
                aria-label={`Remove ${tag}`}
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTag()}
            placeholder="Projector, Whiteboard, Sound System..."
            className="min-h-[44px] w-full max-w-xs rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
          />
          <Button size="sm" variant="outline" onClick={addTag} disabled={!newTag.trim()}>
            Add
          </Button>
        </div>
      </section>

      {/* Booking Defaults */}
      <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
        <h2 className="mb-1 font-display text-lg text-vc-indigo">
          Booking Defaults
        </h2>
        <p className="mb-4 text-sm text-vc-text-secondary">
          Default values for new room reservations.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="flex items-center gap-3 text-sm font-medium text-vc-text">
              <input
                type="checkbox"
                checked={settings.require_approval}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    require_approval: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-vc-border-light text-vc-coral accent-vc-coral"
              />
              Require approval for all reservations
            </label>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
              Max advance booking (days)
            </label>
            <input
              type="number"
              min={1}
              value={settings.max_advance_days}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  max_advance_days: parseInt(e.target.value, 10) || 90,
                }))
              }
              className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
              Default setup time (minutes)
            </label>
            <input
              type="number"
              min={0}
              value={settings.default_setup_minutes}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  default_setup_minutes: parseInt(e.target.value, 10) || 0,
                }))
              }
              className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
              Default teardown time (minutes)
            </label>
            <input
              type="number"
              min={0}
              value={settings.default_teardown_minutes}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  default_teardown_minutes: parseInt(e.target.value, 10) || 0,
                }))
              }
              className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
            />
          </div>
        </div>
      </section>

      {/* Public Calendar */}
      <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
        <h2 className="mb-1 font-display text-lg text-vc-indigo">
          Public Calendar
        </h2>
        <p className="mb-4 text-sm text-vc-text-secondary">
          Expose room availability via an iCal feed.
        </p>
        <label className="flex items-center gap-3 text-sm font-medium text-vc-text">
          <input
            type="checkbox"
            checked={settings.public_calendar_enabled}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                public_calendar_enabled: e.target.checked,
              }))
            }
            className="h-4 w-4 rounded border-vc-border-light text-vc-coral accent-vc-coral"
          />
          Enable public calendar feed
        </label>
        {settings.public_calendar_enabled && settings.public_calendar_token && (
          <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs break-all text-vc-text-muted">
            {`/api/calendar/church/${churchId}/${settings.public_calendar_token}`}
          </p>
        )}
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saving}>
          Save Room Settings
        </Button>
        {saved && <Badge variant="success">Saved</Badge>}
      </div>

      {/* Facility Sharing */}
      <FacilitySharingSection churchId={churchId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Facility Sharing Section (within Rooms tab)
// ---------------------------------------------------------------------------

function FacilitySharingSection({ churchId }: { churchId: string }) {
  const { user, activeMembership } = useAuth();
  const church = activeMembership;
  const tierLimits = TIER_LIMITS[church?.church_id ? "growth" : "free"];

  const [groups, setGroups] = useState<
    Array<FacilityGroup & { membership: FacilityGroupMember; members?: FacilityGroupMember[] }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null);
  const [inviteChurchId, setInviteChurchId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");

  const loadGroups = useCallback(async () => {
    try {
      const facilityGroups = await getChurchFacilityGroups(churchId);
      // Load members for each group
      const withMembers = await Promise.all(
        facilityGroups.map(async (g) => {
          const members = await getFacilityGroupMembers(g.id);
          return { ...g, members };
        }),
      );
      setGroups(withMembers);
    } catch {
      setError("Failed to load facility groups");
    } finally {
      setLoading(false);
    }
  }, [churchId]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  async function handleCreate() {
    if (!newGroupName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const churchSnap = await getDoc(doc(db, "churches", churchId));
      const churchName = churchSnap.data()?.name || "My Organization";
      await createFacilityGroup(newGroupName.trim(), churchId, churchName);
      setNewGroupName("");
      await loadGroups();
    } catch {
      setError("Failed to create facility group");
    } finally {
      setCreating(false);
    }
  }

  async function handleInvite(groupId: string) {
    if (!inviteChurchId.trim()) return;
    setInviting(true);
    setError("");
    try {
      // Look up target church name
      const targetSnap = await getDoc(doc(db, "churches", inviteChurchId.trim()));
      if (!targetSnap.exists()) {
        setError("Organization not found. Check the ID and try again.");
        setInviting(false);
        return;
      }
      const targetName = targetSnap.data()?.name || "Organization";
      const groupData = groups.find((g) => g.id === groupId);

      await inviteToFacilityGroup(
        groupId,
        inviteChurchId.trim(),
        targetName,
        churchId,
      );

      // Send notification email
      if (user) {
        const token = await user.getIdToken();
        fetch("/api/notify/facility-invite", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            church_id: churchId,
            target_church_id: inviteChurchId.trim(),
            facility_group_id: groupId,
            facility_group_name: groupData?.name || "Shared Facility",
          }),
        });
      }

      setInviteChurchId("");
      setInviteGroupId(null);
      await loadGroups();
    } catch {
      setError("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  }

  async function handleAccept(groupId: string) {
    try {
      await acceptFacilityInvite(groupId, churchId);
      await loadGroups();
    } catch {
      setError("Failed to accept invitation");
    }
  }

  async function handleLeave(groupId: string) {
    try {
      await leaveFacilityGroup(groupId, churchId);
      await loadGroups();
    } catch {
      setError("Failed to leave facility group");
    }
  }

  // Separate into groups we belong to and pending invitations
  const activeGroups = groups.filter(
    (g) => g.membership.status === "active",
  );
  const pendingInvites = groups.filter(
    (g) => g.membership.status === "pending",
  );

  return (
    <section className="mt-8 rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
      <h2 className="mb-1 font-display text-lg text-vc-indigo">
        Shared Facility
      </h2>
      <p className="mb-5 text-sm text-vc-text-secondary">
        Link organizations that share the same building so everyone can see
        room reservations across groups.
      </p>

      {error && (
        <p className="mb-4 rounded-lg bg-vc-danger/10 px-3 py-2 text-sm text-vc-danger">
          {error}
        </p>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* Pending invitations */}
          {pendingInvites.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-vc-text">
                Pending Invitations
              </h3>
              {pendingInvites.map((g) => (
                <div
                  key={g.id}
                  className="mb-2 flex items-center justify-between rounded-lg bg-white p-4 ring-1 ring-vc-border-light"
                >
                  <div>
                    <p className="text-sm font-medium text-vc-indigo">
                      {g.name}
                    </p>
                    <p className="text-xs text-vc-text-secondary">
                      Invited by another organization
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleAccept(g.id)}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleLeave(g.id)}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active groups */}
          {activeGroups.length > 0 && (
            <div className="mb-6 space-y-3">
              {activeGroups.map((g) => (
                <div
                  key={g.id}
                  className="rounded-lg bg-white p-4 ring-1 ring-vc-border-light"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-vc-indigo">
                        {g.name}
                      </p>
                      <p className="text-xs text-vc-text-muted">
                        {(g.members?.filter((m) => m.status === "active")
                          .length || 0)}{" "}
                        organization
                        {(g.members?.filter((m) => m.status === "active")
                          .length || 0) !== 1
                          ? "s"
                          : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setInviteGroupId(
                            inviteGroupId === g.id ? null : g.id,
                          )
                        }
                      >
                        Invite Org
                      </Button>
                      <button
                        onClick={() => handleLeave(g.id)}
                        className="text-xs text-vc-text-muted hover:text-vc-danger"
                      >
                        Leave
                      </button>
                    </div>
                  </div>

                  {/* Member list */}
                  <div className="space-y-1">
                    {g.members
                      ?.filter((m) => m.church_id !== churchId)
                      .map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-2 text-xs text-vc-text-secondary"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-vc-sage" />
                          {m.church_name}
                          {m.status === "pending" && (
                            <Badge variant="warning">Pending</Badge>
                          )}
                        </div>
                      ))}
                  </div>

                  {/* Invite form */}
                  {inviteGroupId === g.id && (
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={inviteChurchId}
                        onChange={(e) => setInviteChurchId(e.target.value)}
                        placeholder="Organization ID"
                        className="min-h-[36px] flex-1 rounded-lg border border-vc-border-light bg-white px-3 py-1.5 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleInvite(g.id)}
                        loading={inviting}
                      >
                        Send Invite
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Create new group */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="New facility group name"
              className="min-h-[44px] flex-1 rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
            />
            <Button onClick={handleCreate} loading={creating}>
              Create Group
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
