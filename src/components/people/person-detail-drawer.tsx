"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StepTypeIcon } from "@/components/ui/step-type-icon";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { normalizePhone, formatPhone } from "@/lib/utils/phone";
import { updateChurchDocument } from "@/lib/firebase/firestore";
import { getOrgEligibility } from "@/lib/utils/eligibility";
import { ORG_WIDE_MINISTRY_ID } from "@/lib/types";
import type {
  Volunteer,
  Membership,
  Ministry,
  OnboardingStep,
  OrgRole,
  JourneyStepStatus,
  VolunteerJourneyStep,
} from "@/lib/types";

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  scheduler: "Scheduler",
  volunteer: "Volunteer",
};

const JOURNEY_STATUS_OPTIONS: { value: JourneyStepStatus; label: string }[] = [
  { value: "pending", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Complete" },
  { value: "waived", label: "Waived" },
];

interface PersonDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  volunteer: Volunteer;
  membership: Membership | null;
  churchId: string;
  ministries: Ministry[];
  orgPrereqs: OnboardingStep[];
  availableRoles: { role_id: string; title: string; ministry_id: string }[];
  canManage: boolean;
  getMinistryName: (id: string) => string;
  getMinistryColor: (id: string) => string;
  onVolunteerUpdated: (v: Volunteer) => void;
  onRoleChanged: (m: Membership, role: OrgRole, scope?: string[]) => void;
  onArchive: () => void;
  onRestore: () => void;
  onRemoveFromOrg: () => void;
}

export function PersonDetailDrawer({
  open,
  onClose,
  volunteer,
  membership,
  churchId,
  ministries,
  orgPrereqs,
  availableRoles,
  canManage,
  getMinistryName,
  getMinistryColor,
  onVolunteerUpdated,
  onRoleChanged,
  onArchive,
  onRestore,
  onRemoveFromOrg,
}: PersonDetailDrawerProps) {
  const isArchived = volunteer.status === "archived";

  // --- Profile edit state ---
  const [name, setName] = useState(volunteer.name);
  const [email, setEmail] = useState(volunteer.email);
  const [phone, setPhone] = useState(volunteer.phone || "");
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>(volunteer.ministry_ids);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(volunteer.role_ids);
  const [bgCheckStatus, setBgCheckStatus] = useState(volunteer.background_check?.status || "not_required");
  const [bgCheckExpiry, setBgCheckExpiry] = useState(volunteer.background_check?.expires_at || "");
  const [saving, setSaving] = useState(false);

  // --- Role state ---
  const [selectedOrgRole, setSelectedOrgRole] = useState<OrgRole>(membership?.role || "volunteer");
  const [ministryScope, setMinistryScope] = useState<string[]>(membership?.ministry_scope || []);

  const hasChanges =
    name !== volunteer.name ||
    email !== volunteer.email ||
    (phone || "") !== (volunteer.phone || "") ||
    JSON.stringify([...selectedMinistries].sort()) !== JSON.stringify([...volunteer.ministry_ids].sort()) ||
    JSON.stringify([...selectedRoles].sort()) !== JSON.stringify([...volunteer.role_ids].sort()) ||
    bgCheckStatus !== (volunteer.background_check?.status || "not_required") ||
    bgCheckExpiry !== (volunteer.background_check?.expires_at || "");

  // Reset state when volunteer/membership changes
  useEffect(() => {
    if (open) {
      setName(volunteer.name);
      setEmail(volunteer.email);
      setPhone(volunteer.phone || "");
      setSelectedMinistries(volunteer.ministry_ids);
      setSelectedRoles(volunteer.role_ids);
      setBgCheckStatus(volunteer.background_check?.status || "not_required");
      setBgCheckExpiry(volunteer.background_check?.expires_at || "");
      setSelectedOrgRole(membership?.role || "volunteer");
      setMinistryScope(membership?.ministry_scope || []);
      setSaving(false);
    }
  }, [open, volunteer, membership]);

  // --- Handlers ---

  async function handleSaveProfile() {
    setSaving(true);
    try {
      const background_check = bgCheckStatus === "not_required" ? undefined : {
        status: bgCheckStatus as "cleared" | "pending" | "expired" | "not_required",
        expires_at: bgCheckExpiry || null,
        provider: volunteer.background_check?.provider || null,
        checked_at: bgCheckStatus === "cleared" && volunteer.background_check?.status !== "cleared"
          ? new Date().toISOString()
          : volunteer.background_check?.checked_at || null,
      };
      const updateData = {
        name,
        email,
        phone: phone ? normalizePhone(phone) : null,
        ministry_ids: selectedMinistries,
        role_ids: selectedRoles,
        background_check: background_check || undefined,
      };
      await updateChurchDocument(churchId, "volunteers", volunteer.id, updateData);
      onVolunteerUpdated({ ...volunteer, ...updateData });
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleJourneyStatusChange(
    stepId: string,
    ministryId: string,
    newStatus: JourneyStepStatus,
  ) {
    const journey = [...(volunteer.volunteer_journey || [])];
    const idx = journey.findIndex((j) => j.step_id === stepId && j.ministry_id === ministryId);
    const now = new Date().toISOString();

    const entry: VolunteerJourneyStep = {
      step_id: stepId,
      ministry_id: ministryId,
      status: newStatus,
      completed_at: newStatus === "completed" || newStatus === "waived" ? now : null,
      verified_by: null,
      notes: idx >= 0 ? journey[idx].notes : null,
    };

    if (idx >= 0) {
      journey[idx] = entry;
    } else {
      journey.push(entry);
    }

    try {
      await updateChurchDocument(churchId, "volunteers", volunteer.id, { volunteer_journey: journey });
      onVolunteerUpdated({ ...volunteer, volunteer_journey: journey });
    } catch {
      // silent
    }
  }

  function handleOrgRoleChange(newRole: OrgRole) {
    setSelectedOrgRole(newRole);
    if (membership) {
      onRoleChanged(membership, newRole, newRole === "scheduler" ? ministryScope : undefined);
    }
  }

  function handleTeamRoleToggle(teamId: string) {
    const isSchedulerForTeam = selectedOrgRole === "scheduler" && ministryScope.includes(teamId);

    if (isSchedulerForTeam) {
      // Demote from scheduler on this team
      const nextScope = ministryScope.filter((m) => m !== teamId);
      if (nextScope.length === 0) {
        // No scheduler teams left → revert to volunteer role
        setSelectedOrgRole("volunteer");
        setMinistryScope([]);
        if (membership) onRoleChanged(membership, "volunteer");
      } else {
        setMinistryScope(nextScope);
        if (membership) onRoleChanged(membership, "scheduler", nextScope);
      }
    } else {
      // Promote to scheduler on this team
      const nextScope = selectedOrgRole === "scheduler"
        ? [...ministryScope, teamId]
        : [teamId];
      setSelectedOrgRole("scheduler");
      setMinistryScope(nextScope);
      if (membership) onRoleChanged(membership, "scheduler", nextScope);
    }
  }

  function handleMinistryScpeToggle(mid: string) {
    const next = ministryScope.includes(mid)
      ? ministryScope.filter((m) => m !== mid)
      : [...ministryScope, mid];
    setMinistryScope(next);
    if (membership && selectedOrgRole === "scheduler") {
      onRoleChanged(membership, "scheduler", next);
    }
  }

  // --- Eligibility data ---
  const orgEligibility = getOrgEligibility(volunteer, orgPrereqs);
  const journey = volunteer.volunteer_journey || [];
  const myMinistryIds = volunteer.ministry_ids || [];

  // Build prereq groups for display
  const prereqGroups: {
    label: string;
    ministryId: string;
    color?: string;
    steps: { step: OnboardingStep; journeyStep?: VolunteerJourneyStep }[];
  }[] = [];

  if (orgPrereqs.length > 0) {
    prereqGroups.push({
      label: "Organization-Wide",
      ministryId: ORG_WIDE_MINISTRY_ID,
      steps: orgPrereqs.map((step) => ({
        step,
        journeyStep: journey.find((j) => j.step_id === step.id && j.ministry_id === ORG_WIDE_MINISTRY_ID),
      })),
    });
  }

  for (const mid of myMinistryIds) {
    const ministry = ministries.find((m) => m.id === mid);
    if (!ministry?.prerequisites?.length) continue;
    prereqGroups.push({
      label: ministry.name,
      ministryId: mid,
      color: ministry.color,
      steps: ministry.prerequisites.map((step) => ({
        step,
        journeyStep: journey.find((j) => j.step_id === step.id && j.ministry_id === mid),
      })),
    });
  }

  const hasPrereqs = prereqGroups.length > 0;

  // Progress stats for eligibility section
  const totalSteps = prereqGroups.reduce((sum, g) => sum + g.steps.length, 0);
  const completedSteps = prereqGroups.reduce(
    (sum, g) => sum + g.steps.filter((s) => s.journeyStep?.status === "completed" || s.journeyStep?.status === "waived").length,
    0,
  );

  function getInitials(n: string) {
    return n.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("");
  }

  return (
    <Drawer open={open} onClose={onClose} title={volunteer.name} subtitle={volunteer.email || undefined}>
      <div className="space-y-6">
        {/* Hero avatar + eligibility at-a-glance */}
        <div className="flex items-center gap-4 rounded-xl bg-vc-bg-warm/60 p-4 -mx-2">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-vc-indigo/10 text-lg font-semibold text-vc-indigo">
            {getInitials(volunteer.name)}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg text-vc-indigo truncate">{volunteer.name}</h3>
            {isArchived && (
              <Badge variant="default">Archived</Badge>
            )}
            {hasPrereqs && totalSteps > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-vc-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-vc-sage transition-all duration-500"
                    style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
                  />
                </div>
                <span className="shrink-0 text-[11px] font-medium text-vc-text-muted">
                  {completedSteps}/{totalSteps}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ================================================================
            Section A — Profile & Contact
           ================================================================ */}
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-vc-text-muted">
            <span className="h-px flex-1 bg-vc-border-light" />
            Profile & Contact
            <span className="h-px flex-1 bg-vc-border-light" />
          </h3>
          {canManage && !isArchived ? (
            <div className="space-y-3">
              <div className="space-y-3">
                <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
                <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Input
                  label="Phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => { if (phone) setPhone(formatPhone(phone)); }}
                />
              </div>

              {/* Ministry toggles */}
              {ministries.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-vc-text">Teams</label>
                  <div className="flex flex-wrap gap-2">
                    {ministries.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setSelectedMinistries((prev) =>
                            prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                          )
                        }
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all min-h-[44px] ${
                          selectedMinistries.includes(m.id)
                            ? "border-transparent text-white"
                            : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                        }`}
                        style={selectedMinistries.includes(m.id) ? { backgroundColor: m.color } : undefined}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: selectedMinistries.includes(m.id) ? "white" : m.color }}
                        />
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Qualified roles */}
              {(() => {
                const relevant = availableRoles.filter((r) => selectedMinistries.includes(r.ministry_id));
                if (relevant.length === 0) return null;
                return (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-vc-text">Qualified Roles</label>
                    <div className="flex flex-wrap gap-2">
                      {relevant.map((r) => (
                        <button
                          key={r.role_id}
                          type="button"
                          onClick={() =>
                            setSelectedRoles((prev) =>
                              prev.includes(r.role_id) ? prev.filter((x) => x !== r.role_id) : [...prev, r.role_id],
                            )
                          }
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all min-h-[44px] ${
                            selectedRoles.includes(r.role_id)
                              ? "border-vc-coral bg-vc-coral/10 text-vc-coral"
                              : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                          }`}
                        >
                          {selectedRoles.includes(r.role_id) && (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                          )}
                          {r.title}
                          <span className="text-[10px] text-vc-text-muted">({getMinistryName(r.ministry_id)})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Background check */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-vc-text">Background Check</label>
                  <select
                    className="w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none min-h-[44px]"
                    value={bgCheckStatus}
                    onChange={(e) => setBgCheckStatus(e.target.value as "cleared" | "pending" | "expired" | "not_required")}
                  >
                    <option value="not_required">Not Required</option>
                    <option value="pending">Pending</option>
                    <option value="cleared">Cleared</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
                {(bgCheckStatus === "cleared" || bgCheckStatus === "expired") && (
                  <Input label="Expiry Date" type="date" value={bgCheckExpiry} onChange={(e) => setBgCheckExpiry(e.target.value)} />
                )}
              </div>

            </div>
          ) : (
            /* Read-only view for non-admins or archived */
            <div className="space-y-2 text-sm">
              <p><span className="font-medium text-vc-text">Name:</span> {volunteer.name}</p>
              <p><span className="font-medium text-vc-text">Email:</span> {volunteer.email || "\u2014"}</p>
              <p><span className="font-medium text-vc-text">Phone:</span> {formatPhone(volunteer.phone)}</p>
              {volunteer.ministry_ids.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {volunteer.ministry_ids.map((mid) => (
                    <span
                      key={mid}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: getMinistryColor(mid) + "15", color: getMinistryColor(mid) }}
                    >
                      {getMinistryName(mid)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ================================================================
            Section B — Eligibility / Prerequisite Tracking
           ================================================================ */}
        {hasPrereqs && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-vc-text-muted">
              <span className="h-px flex-1 bg-vc-border-light" />
              Eligibility
              <span className="h-px flex-1 bg-vc-border-light" />
            </h3>
            <div className="mb-3 flex items-center gap-2">
              <Badge
                variant={
                  orgEligibility === "cleared" ? "success"
                    : orgEligibility === "in_progress" ? "warning"
                    : orgEligibility === "no_prereqs" ? "success"
                    : "default"
                }
              >
                {orgEligibility === "cleared" ? "Cleared"
                  : orgEligibility === "in_progress" ? "In Progress"
                  : orgEligibility === "no_prereqs" ? "No Prereqs"
                  : "Not Started"}
              </Badge>
            </div>

            {prereqGroups.map((group) => (
              <div key={group.label} className="mb-4">
                <div className="mb-2 flex items-center gap-2">
                  {group.color && (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
                  )}
                  <span className="text-xs font-semibold text-vc-text-secondary">{group.label}</span>
                </div>
                <div className="space-y-2">
                  {group.steps.map(({ step, journeyStep }) => {
                    const status: JourneyStepStatus = journeyStep?.status || "pending";
                    const isComplete = status === "completed" || status === "waived";

                    return (
                      <div
                        key={step.id}
                        className={`flex items-center gap-3 rounded-lg border p-3 ${
                          isComplete ? "border-vc-sage/30 bg-vc-sage/5"
                            : status === "in_progress" ? "border-vc-sand/40 bg-vc-sand/5"
                            : "border-vc-border-light bg-white"
                        }`}
                      >
                        <div className={`shrink-0 ${isComplete ? "text-vc-sage" : status === "in_progress" ? "text-vc-sand" : "text-vc-text-muted"}`}>
                          <StepTypeIcon type={step.type} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${isComplete ? "text-vc-sage line-through" : "text-vc-indigo"}`}>
                            {step.label}
                          </p>
                          {journeyStep?.completed_at && (
                            <p className="text-[11px] text-vc-text-muted">
                              Completed {new Date(journeyStep.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          )}
                        </div>
                        {canManage ? (
                          <select
                            className="shrink-0 rounded-lg border border-vc-border bg-white px-2 py-1.5 text-xs text-vc-text focus:border-vc-coral focus:outline-none min-h-[44px]"
                            value={status}
                            onChange={(e) =>
                              handleJourneyStatusChange(step.id, group.ministryId, e.target.value as JourneyStepStatus)
                            }
                          >
                            {JOURNEY_STATUS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <Badge
                            variant={isComplete ? "success" : status === "in_progress" ? "warning" : "default"}
                          >
                            {JOURNEY_STATUS_OPTIONS.find((o) => o.value === status)?.label || status}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ================================================================
            Section C — Access & Permissions
           ================================================================ */}
        {canManage && membership && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-vc-text-muted">
              <span className="h-px flex-1 bg-vc-border-light" />
              Access & Permissions
              <span className="h-px flex-1 bg-vc-border-light" />
            </h3>
            <div className="space-y-4">

              {/* --- Organization Role --- */}
              <div className="rounded-xl border border-vc-border-light bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
                  Organization Role
                </p>
                {selectedOrgRole === "owner" ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="accent">Owner</Badge>
                    <InfoTooltip text="Manages billing and organization settings. Ownership can be transferred on the Organization page." />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-medium ${selectedOrgRole === "admin" ? "text-vc-indigo" : "text-vc-text-secondary"}`}>
                        {selectedOrgRole === "admin" ? "Administrator" : "Member"}
                      </span>
                      {selectedOrgRole === "admin" && <Badge variant="primary">Admin</Badge>}
                    </div>
                    {selectedOrgRole !== "admin" ? (
                      <button
                        type="button"
                        onClick={() => handleOrgRoleChange("admin")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-vc-coral/30 bg-vc-coral/5 px-3 py-1.5 text-sm font-medium text-vc-coral transition-colors hover:bg-vc-coral/10 min-h-[44px]"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                        </svg>
                        Make Administrator
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOrgRoleChange("volunteer")}
                        className="text-xs font-medium text-vc-text-muted transition-colors hover:text-vc-danger"
                      >
                        Remove admin access
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* --- Team Roles --- */}
              {selectedMinistries.length > 0 && (
                <div className="rounded-xl border border-vc-border-light bg-white p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
                    Team Roles
                  </p>
                  {selectedOrgRole === "admin" || selectedOrgRole === "owner" ? (
                    <div className="space-y-2">
                      <p className="text-sm text-vc-text-secondary">
                        {selectedOrgRole === "owner" ? "Owners" : "Administrators"} can schedule all teams.
                      </p>
                      <div className="space-y-1">
                        {selectedMinistries.map((mid) => {
                          const m = ministries.find((x) => x.id === mid);
                          if (!m) return null;
                          return (
                            <div key={mid} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                              <span className="text-sm text-vc-text flex-1">{m.name}</span>
                              <span className="text-[11px] font-medium text-vc-text-muted">Admin</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {selectedMinistries.map((mid) => {
                        const m = ministries.find((x) => x.id === mid);
                        if (!m) return null;
                        const isSchedulerForTeam = selectedOrgRole === "scheduler" && ministryScope.includes(mid);
                        return (
                          <div key={mid} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                            <span className="text-sm text-vc-text flex-1">{m.name}</span>
                            <button
                              type="button"
                              onClick={() => handleTeamRoleToggle(mid)}
                              className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all min-h-[44px] ${
                                isSchedulerForTeam
                                  ? "border-vc-sand/50 bg-vc-sand/10 text-vc-warning"
                                  : "border-vc-border text-vc-text-muted hover:border-vc-indigo/20"
                              }`}
                            >
                              {isSchedulerForTeam ? "Scheduler" : "Volunteer"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>
          </section>
        )}

        {/* Lifecycle actions */}
        {canManage && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-vc-text-muted">
              <span className="h-px flex-1 bg-vc-border-light" />
              Actions
              <span className="h-px flex-1 bg-vc-border-light" />
            </h3>
            <div className="flex flex-wrap gap-2">
              {!isArchived ? (
                <Button size="sm" variant="ghost" onClick={onArchive}>
                  <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                  </svg>
                  Archive
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={onRestore} className="text-vc-sage">
                  <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                  </svg>
                  Restore
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-vc-danger hover:bg-vc-danger/5"
                onClick={onRemoveFromOrg}
              >
                <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
                </svg>
                Remove from Organization
              </Button>
            </div>
          </section>
        )}
        {/* Sticky save footer — only visible when there are unsaved changes */}
        <AnimatePresence>
          {canManage && !isArchived && hasChanges && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="sticky bottom-0 -mx-6 mt-4 border-t border-vc-border-light bg-vc-bg-warm/95 px-6 py-3 backdrop-blur-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-vc-text-muted">Unsaved changes</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setName(volunteer.name);
                      setEmail(volunteer.email);
                      setPhone(volunteer.phone || "");
                      setSelectedMinistries(volunteer.ministry_ids);
                      setSelectedRoles(volunteer.role_ids);
                      setBgCheckStatus(volunteer.background_check?.status || "not_required");
                      setBgCheckExpiry(volunteer.background_check?.expires_at || "");
                    }}
                  >
                    Reset
                  </Button>
                  <Button size="sm" loading={saving} onClick={handleSaveProfile}>
                    Save Changes
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Drawer>
  );
}
