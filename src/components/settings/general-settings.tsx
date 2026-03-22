"use client";

import { useState, type FormEvent } from "react";
import { updateDocument } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { isAdmin, isOwner } from "@/lib/utils/permissions";
import { WORKFLOW_MODES } from "@/lib/constants";
import type { OrgType, WorkflowMode, Church, Campus, Membership } from "@/lib/types";
import type { User } from "firebase/auth";

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
];

interface GeneralSettingsProps {
  churchId: string;
  church: Church;
  setChurch: (church: Church) => void;
  orgName: string;
  setOrgName: (name: string) => void;
  orgType: OrgType;
  setOrgType: (type: OrgType) => void;
  orgTimezone: string;
  setOrgTimezone: (tz: string) => void;
  orgWorkflowMode: WorkflowMode;
  // Check-in settings
  selfCheckInEnabled: boolean;
  setSelfCheckInEnabled: (v: boolean) => void;
  windowBefore: number;
  setWindowBefore: (v: number) => void;
  windowAfter: number;
  setWindowAfter: (v: number) => void;
  proximityEnabled: boolean;
  setProximityEnabled: (v: boolean) => void;
  proximityRadius: number;
  setProximityRadius: (v: number) => void;
  campuses: Campus[];
  // Auth
  user: User | null;
  activeMembership: Membership | null;
}

export function GeneralSettings({
  churchId,
  church,
  setChurch,
  orgName,
  setOrgName,
  orgType,
  setOrgType,
  orgTimezone,
  setOrgTimezone,
  orgWorkflowMode,
  selfCheckInEnabled,
  setSelfCheckInEnabled,
  windowBefore,
  setWindowBefore,
  windowAfter,
  setWindowAfter,
  proximityEnabled,
  setProximityEnabled,
  proximityRadius,
  setProximityRadius,
  campuses,
  user,
  activeMembership,
}: GeneralSettingsProps) {
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgSuccess, setOrgSuccess] = useState("");
  const [orgError, setOrgError] = useState("");

  const [checkInSaving, setCheckInSaving] = useState(false);
  const [checkInSuccess, setCheckInSuccess] = useState("");


  const orgDirty =
    orgName !== (church.name || "") ||
    orgType !== (church.org_type || "church") ||
    orgTimezone !== (church.timezone || "America/New_York");

  const workflowLabel =
    WORKFLOW_MODES.find((m) => m.value === orgWorkflowMode)?.label || orgWorkflowMode;

  // --- General settings handler ---

  async function handleOrgSave(e: FormEvent) {
    e.preventDefault();
    setOrgSaving(true);
    setOrgError("");
    setOrgSuccess("");
    try {
      const slug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      await updateDocument("churches", churchId, {
        name: orgName,
        slug,
        org_type: orgType,
        timezone: orgTimezone,
      });
      setChurch({ ...church, name: orgName, org_type: orgType, timezone: orgTimezone });
      setOrgSuccess("Organization settings updated.");
      setTimeout(() => setOrgSuccess(""), 3000);
    } catch (err) {
      setOrgError((err as Error).message || "Failed to update organization.");
    } finally {
      setOrgSaving(false);
    }
  }

  // --- Check-in settings handler ---

  async function handleCheckInSettingsSave() {
    setCheckInSaving(true);
    try {
      const updatedSettings = {
        ...church.settings,
        self_check_in_enabled: selfCheckInEnabled,
        check_in_window_before: windowBefore,
        check_in_window_after: windowAfter,
        proximity_check_in_enabled: proximityEnabled,
        proximity_radius_meters: proximityRadius,
      };
      await updateDocument("churches", churchId, { settings: updatedSettings });
      setChurch({ ...church, settings: updatedSettings });
      setCheckInSuccess("Check-in settings saved.");
      setTimeout(() => setCheckInSuccess(""), 3000);
    } catch {
      // silent
    } finally {
      setCheckInSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* ── General Settings ── */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-vc-indigo">General</h2>
        <div className="rounded-xl border border-vc-border-light bg-white p-6">
          <form onSubmit={handleOrgSave} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-vc-text">Organization Type</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { value: "church" as const, label: "Church" },
                  { value: "nonprofit" as const, label: "Nonprofit" },
                  { value: "other" as const, label: "Other" },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setOrgType(opt.value)}
                    className={`rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                      orgType === opt.value
                        ? "border-vc-coral bg-vc-coral/5 text-vc-indigo ring-1 ring-vc-coral"
                        : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20 hover:bg-vc-bg-warm"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label={orgType === "church" ? "Church Name" : "Organization Name"}
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
            />

            <Select
              label="Timezone"
              options={TIMEZONE_OPTIONS}
              value={orgTimezone}
              onChange={(e) => setOrgTimezone(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-vc-text">Scheduling Workflow</label>
              <div className="flex items-center gap-2">
                <span className="inline-flex rounded-full bg-vc-indigo/10 px-3 py-1 text-sm font-medium text-vc-indigo">
                  {workflowLabel}
                </span>
                <span className="text-xs text-vc-text-muted">
                  Contact support to change workflow mode.
                </span>
              </div>
            </div>

            {orgError && <p className="text-sm text-vc-danger">{orgError}</p>}
            {orgSuccess && <p className="text-sm text-vc-sage">{orgSuccess}</p>}
            <Button type="submit" loading={orgSaving} disabled={!orgDirty} size="sm">
              Save Changes
            </Button>
          </form>
        </div>
      </section>

      {/* ── Check-In Settings ── */}
      {isAdmin(activeMembership) && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-vc-indigo">Check-In Settings</h2>
          <div className="rounded-xl border border-vc-border-light bg-white p-6">
            <div className="space-y-5">
              {/* Self-check-in toggle */}
              <label className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-vc-indigo">Allow self-check-in</p>
                  <p className="text-xs text-vc-text-muted">
                    Volunteers can check in from the app without scanning a QR code
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={selfCheckInEnabled}
                  onClick={() => setSelfCheckInEnabled(!selfCheckInEnabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    selfCheckInEnabled ? "bg-vc-sage" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                      selfCheckInEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>

              {/* Window settings (only visible when enabled) */}
              {selfCheckInEnabled && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-vc-indigo">
                      Minutes before service
                    </label>
                    <Input
                      type="number"
                      min={5}
                      max={180}
                      value={windowBefore}
                      onChange={(e) => setWindowBefore(parseInt(e.target.value, 10) || 60)}
                      className="max-w-[120px]"
                    />
                    <p className="mt-1 text-xs text-vc-text-muted">
                      Check-in opens this many minutes before the service starts
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-vc-indigo">
                      Minutes after start
                    </label>
                    <Input
                      type="number"
                      min={5}
                      max={120}
                      value={windowAfter}
                      onChange={(e) => setWindowAfter(parseInt(e.target.value, 10) || 30)}
                      className="max-w-[120px]"
                    />
                    <p className="mt-1 text-xs text-vc-text-muted">
                      Check-in window closes this many minutes after service starts
                    </p>
                  </div>
                </div>
              )}

              {/* Proximity settings -- only show if at least one campus has coordinates */}
              {selfCheckInEnabled && campuses.some((c) => c.location) && (
                <>
                  <div className="border-t border-vc-border-light pt-5">
                    <label className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-vc-indigo">Enable proximity check-in</p>
                        <p className="text-xs text-vc-text-muted">
                          Volunteers near a campus will be prompted to check in automatically
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={proximityEnabled}
                        onClick={() => setProximityEnabled(!proximityEnabled)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          proximityEnabled ? "bg-vc-sage" : "bg-gray-200"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                            proximityEnabled ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </label>
                  </div>

                  {proximityEnabled && (
                    <div className="max-w-xs">
                      <label className="mb-1 block text-sm font-medium text-vc-indigo">
                        Proximity radius (meters)
                      </label>
                      <Input
                        type="number"
                        min={50}
                        max={2000}
                        value={proximityRadius}
                        onChange={(e) => setProximityRadius(parseInt(e.target.value, 10) || 200)}
                      />
                      <p className="mt-1 text-xs text-vc-text-muted">
                        How close a volunteer must be to a campus to trigger proximity check-in
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Save */}
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={handleCheckInSettingsSave}
                  loading={checkInSaving}
                >
                  Save Check-In Settings
                </Button>
                {checkInSuccess && (
                  <span className="text-sm text-vc-sage">{checkInSuccess}</span>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Worship Integrations ── */}
      {isAdmin(activeMembership) && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-vc-indigo">Worship Integrations</h2>
          <div className="rounded-xl border border-vc-border-light bg-white p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-vc-bg-warm">
                <svg className="h-5 w-5 text-vc-indigo" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-vc-indigo">CCLI SongSelect Import</h3>
                <p className="mt-0.5 text-xs text-vc-text-muted">
                  Import songs by uploading .usr or .txt files from songselect.ccli.com. Go to Songs &rarr; Import Songs to get started.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Danger Zone ── */}
      {isOwner(activeMembership) && (
        <DeleteOrgSection churchId={churchId} orgName={orgName} user={user} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Organization (kept co-located with general settings)
// ---------------------------------------------------------------------------

function DeleteOrgSection({
  churchId,
  orgName,
  user,
}: {
  churchId: string;
  orgName: string;
  user: User | null;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (!user || confirmText !== orgName) return;
    setDeleting(true);
    setError("");

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/organization", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ church_id: churchId, confirm_name: confirmText }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Deletion failed" }));
        setError(data.error || "Failed to delete organization.");
        return;
      }

      // Full reload to dashboard
      window.location.href = "/dashboard";
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-vc-danger">Danger Zone</h2>
      <div className="rounded-xl border border-vc-danger/30 bg-white p-6">
        <h3 className="font-medium text-vc-indigo">Delete Organization</h3>
        <p className="mt-1 text-sm text-vc-text-muted">
          Permanently deleting an organization removes all its data including volunteers,
          schedules, memberships, and billing. This cannot be undone.
        </p>

        {!showConfirm ? (
          <Button
            variant="outline"
            className="mt-4 border-vc-danger/30 text-vc-danger hover:bg-vc-danger/5"
            onClick={() => setShowConfirm(true)}
          >
            Delete this organization
          </Button>
        ) : (
          <div className="mt-4 rounded-xl border border-vc-danger/20 bg-vc-danger/5 p-4">
            <p className="text-sm font-medium text-vc-danger mb-3">
              Type <strong>&quot;{orgName}&quot;</strong> to confirm deletion:
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={orgName}
            />
            {error && (
              <p className="mt-2 text-sm text-vc-danger">{error}</p>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                onClick={handleDelete}
                loading={deleting}
                disabled={confirmText !== orgName}
                className="bg-vc-danger hover:bg-vc-danger/90 text-white"
              >
                Permanently delete
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText("");
                  setError("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
