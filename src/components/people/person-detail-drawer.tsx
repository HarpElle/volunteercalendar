"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { StepTypeIcon } from "@/components/ui/step-type-icon";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ImageCropModal } from "@/components/ui/image-crop-modal";
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
  const { confirm } = useConfirm();
  const isArchived = volunteer.status === "archived";

  // --- Edit mode (Profile & Contact only) ---
  const [editMode, setEditMode] = useState(false);

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

  // --- Collapsible sections ---
  const [dangerOpen, setDangerOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  // --- Photo upload ---
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  // Track changes for Profile & Contact fields only
  const hasProfileChanges =
    name !== volunteer.name ||
    email !== volunteer.email ||
    (phone || "") !== (volunteer.phone || "");

  // Track all changes (profile + teams/roles/bg check)
  const hasChanges =
    hasProfileChanges ||
    JSON.stringify([...selectedMinistries].sort()) !== JSON.stringify([...volunteer.ministry_ids].sort()) ||
    JSON.stringify([...selectedRoles].sort()) !== JSON.stringify([...volunteer.role_ids].sort()) ||
    bgCheckStatus !== (volunteer.background_check?.status || "not_required") ||
    bgCheckExpiry !== (volunteer.background_check?.expires_at || "");

  // Reset state when volunteer/membership changes or drawer opens
  useEffect(() => {
    if (open) {
      setEditMode(false);
      setDangerOpen(false);
      setAccessOpen(false);
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
      setEditMode(false);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTeamChanges() {
    setSaving(true);
    try {
      const updateData = {
        ministry_ids: selectedMinistries,
        role_ids: selectedRoles,
      };
      await updateChurchDocument(churchId, "volunteers", volunteer.id, updateData);
      onVolunteerUpdated({ ...volunteer, ...updateData });
    } catch (err) {
      console.error("[PersonDetailDrawer] Save team changes failed:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveBgCheck() {
    setSaving(true);
    try {
      const background_check = bgCheckStatus === "not_required" ? null : {
        status: bgCheckStatus as "cleared" | "pending" | "expired" | "not_required",
        expires_at: bgCheckExpiry || null,
        provider: volunteer.background_check?.provider || null,
        checked_at: bgCheckStatus === "cleared" && volunteer.background_check?.status !== "cleared"
          ? new Date().toISOString()
          : volunteer.background_check?.checked_at || null,
      };
      await updateChurchDocument(churchId, "volunteers", volunteer.id, { background_check });
      onVolunteerUpdated({ ...volunteer, background_check: background_check || undefined });
    } catch (err) {
      console.error("[PersonDetailDrawer] Save bg check failed:", err);
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

  async function handleBgCheckChange(newStatus: string) {
    if (newStatus === "cleared" && bgCheckStatus !== "cleared") {
      const ok = await confirm({
        title: "Mark Background Check as Cleared?",
        message: `This will mark ${volunteer.name}'s background check as cleared. Make sure you have verified this through your organization's background check provider.`,
        confirmLabel: "Mark Cleared",
        variant: "default",
      });
      if (!ok) return;
    }
    setBgCheckStatus(newStatus as "cleared" | "pending" | "expired" | "not_required");
  }

  async function handleOrgRoleChange(newRole: OrgRole) {
    if (newRole === "admin") {
      const ok = await confirm({
        title: "Grant Administrator Access?",
        message: `This will give ${volunteer.name} full administrative control over your organization, including managing people, teams, schedules, and settings. Only do this if you fully trust this person with organization management.`,
        confirmLabel: "Make Administrator",
        variant: "danger",
      });
      if (!ok) return;
    }
    setSelectedOrgRole(newRole);
    if (membership) {
      onRoleChanged(membership, newRole, newRole === "scheduler" ? ministryScope : undefined);
    }
  }

  function handleTeamRoleToggle(teamId: string) {
    const isSchedulerForTeam = selectedOrgRole === "scheduler" && ministryScope.includes(teamId);

    if (isSchedulerForTeam) {
      const nextScope = ministryScope.filter((m) => m !== teamId);
      if (nextScope.length === 0) {
        setSelectedOrgRole("volunteer");
        setMinistryScope([]);
        if (membership) onRoleChanged(membership, "volunteer");
      } else {
        setMinistryScope(nextScope);
        if (membership) onRoleChanged(membership, "scheduler", nextScope);
      }
    } else {
      const nextScope = selectedOrgRole === "scheduler"
        ? [...ministryScope, teamId]
        : [teamId];
      setSelectedOrgRole("scheduler");
      setMinistryScope(nextScope);
      if (membership) onRoleChanged(membership, "scheduler", nextScope);
    }
  }

  async function handleArchive() {
    const ok = await confirm({
      title: `Archive ${volunteer.name}?`,
      message: "They'll be removed from all teams and excluded from future scheduling and event invitations. They can still see the organization. You can restore them later.",
      confirmLabel: "Archive",
      variant: "danger",
    });
    if (ok) onArchive();
  }

  async function handleRemoveFromOrg() {
    const ok = await confirm({
      title: `Remove ${volunteer.name}?`,
      message: "They will lose all access and won't be able to see the organization unless re-invited. This cannot be undone.",
      confirmLabel: "Remove from Organization",
      variant: "danger",
    });
    if (ok) onRemoveFromOrg();
  }

  async function handlePhotoUpload(blob: Blob) {
    setUploadingPhoto(true);
    try {
      const token = await (await import("firebase/auth")).getAuth().currentUser?.getIdToken();
      const form = new FormData();
      form.append("file", new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
      form.append("church_id", churchId);
      const res = await fetch(`/api/volunteers/${volunteer.id}/photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        const { photo_url } = await res.json();
        onVolunteerUpdated({ ...volunteer, photo_url });
      }
    } catch {
      // silent
    } finally {
      setUploadingPhoto(false);
    }
  }

  function openPhotoPicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          alert("File too large. Maximum size is 5 MB.");
          return;
        }
        setCropFile(file);
      }
    };
    input.click();
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

  // Progress stats
  const totalSteps = prereqGroups.reduce((sum, g) => sum + g.steps.length, 0);
  const completedSteps = prereqGroups.reduce(
    (sum, g) => sum + g.steps.filter((s) => s.journeyStep?.status === "completed" || s.journeyStep?.status === "waived").length,
    0,
  );

  // Which teams require background check?
  const teamsRequiringBgCheck = ministries.filter(
    (m) => myMinistryIds.includes(m.id) && m.prerequisites?.some((p) => p.type === "background_check"),
  );

  return (
    <>
    <Drawer open={open} onClose={onClose} title={volunteer.name} subtitle={volunteer.email || undefined}>
      <div className="space-y-6">
        {/* ================================================================
            Combined Hero — Avatar + Name + Contact + Edit
           ================================================================ */}
        <div className="rounded-xl bg-vc-bg-warm/60 p-4 -mx-2">
          <div className="flex items-start gap-4">
            {/* Avatar with upload */}
            <div className="relative shrink-0">
              <Avatar
                name={volunteer.name}
                photoUrl={volunteer.photo_url}
                size="xl"
                eligibility={orgEligibility}
                showUploadOverlay={canManage && !isArchived}
                onClick={canManage && !isArchived ? openPhotoPicker : undefined}
              />
              {uploadingPhoto && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-vc-coral border-t-transparent" />
                </div>
              )}
            </div>

            {/* Name + contact info OR edit form */}
            {editMode ? (
              <div className="min-w-0 flex-1 space-y-2.5">
                <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
                <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Input
                  label="Phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => { if (phone) setPhone(formatPhone(phone)); }}
                />
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" loading={saving} onClick={handleSaveProfile} disabled={!hasProfileChanges}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setName(volunteer.name);
                      setEmail(volunteer.email);
                      setPhone(volunteer.phone || "");
                      setEditMode(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg text-vc-indigo truncate">
                      {volunteer.name}
                    </h3>
                    {isArchived && <Badge variant="default">Archived</Badge>}
                    {volunteer.email && (
                      <p className="mt-0.5 text-sm text-vc-text-secondary truncate">{volunteer.email}</p>
                    )}
                    {volunteer.phone && (
                      <p className="text-sm text-vc-text-muted">{formatPhone(volunteer.phone)}</p>
                    )}
                    {hasPrereqs && totalSteps > 0 && (
                      <p className="mt-1 text-[11px] font-medium text-vc-text-muted">
                        {completedSteps === totalSteps
                          ? "All steps complete"
                          : `${completedSteps} of ${totalSteps} steps`}
                      </p>
                    )}
                  </div>
                  {canManage && !isArchived && (
                    <button
                      onClick={() => setEditMode(true)}
                      className="flex shrink-0 items-center gap-1.5 rounded-full border border-vc-border-light bg-white px-3 py-1.5 text-xs font-medium text-vc-text-secondary transition-colors hover:border-vc-indigo/30 hover:text-vc-indigo"
                    >
                      Edit
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ================================================================
            Section 2 — Teams & Roles (always interactive)
           ================================================================ */}
        {canManage && !isArchived && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-vc-text-muted">
              <span className="h-px flex-1 bg-vc-border-light" />
              Teams & Roles
              <span className="h-px flex-1 bg-vc-border-light" />
            </h3>

            {/* Ministry toggles */}
            {ministries.length > 0 && (
              <div className="mb-3">
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

            {/* Save teams/roles changes */}
            {(JSON.stringify([...selectedMinistries].sort()) !== JSON.stringify([...volunteer.ministry_ids].sort()) ||
              JSON.stringify([...selectedRoles].sort()) !== JSON.stringify([...volunteer.role_ids].sort())) && (
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" loading={saving} onClick={handleSaveTeamChanges}>
                  Save Team Changes
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedMinistries(volunteer.ministry_ids);
                    setSelectedRoles(volunteer.role_ids);
                  }}
                >
                  Reset
                </Button>
              </div>
            )}
          </section>
        )}

        {/* Read-only teams for non-admins or archived */}
        {(!canManage || isArchived) && volunteer.ministry_ids.length > 0 && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-vc-text-muted">
              <span className="h-px flex-1 bg-vc-border-light" />
              Teams
              <span className="h-px flex-1 bg-vc-border-light" />
            </h3>
            <div className="flex flex-wrap gap-1">
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
          </section>
        )}

        {/* ================================================================
            Section 3 — Eligibility (prereqs + background check)
           ================================================================ */}
        {(hasPrereqs || teamsRequiringBgCheck.length > 0 || canManage) && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-vc-text-muted">
              <span className="h-px flex-1 bg-vc-border-light" />
              Eligibility
              <span className="h-px flex-1 bg-vc-border-light" />
            </h3>

            {/* Eligibility badge */}
            {hasPrereqs && (
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
                    : orgEligibility === "no_prereqs" ? "No Prerequisites"
                    : "Not Started"}
                </Badge>
                {totalSteps > 0 && (
                  <span className="text-xs text-vc-text-muted">
                    {completedSteps} of {totalSteps} steps complete
                  </span>
                )}
              </div>
            )}

            {/* Prerequisite groups */}
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

            {/* Background check — now part of Eligibility */}
            {canManage && !isArchived && (
              <div className="rounded-xl border border-vc-border-light bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="h-4 w-4 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                  </svg>
                  <p className="text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
                    Background Check
                  </p>
                </div>
                {teamsRequiringBgCheck.length > 0 && (
                  <p className="mb-2 text-[11px] text-vc-text-muted">
                    Required by: {teamsRequiringBgCheck.map((m) => m.name).join(", ")}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <select
                      className="w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none min-h-[44px]"
                      value={bgCheckStatus}
                      onChange={(e) => handleBgCheckChange(e.target.value)}
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
                {/* Save bg check changes */}
                {(bgCheckStatus !== (volunteer.background_check?.status || "not_required") ||
                  bgCheckExpiry !== (volunteer.background_check?.expires_at || "")) && (
                  <div className="mt-3">
                    <Button size="sm" loading={saving} onClick={handleSaveBgCheck}>
                      Save Background Check
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ================================================================
            Section 4 — Access & Permissions (collapsible)
           ================================================================ */}
        {canManage && membership && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-vc-text-muted">
              <span className="h-px flex-1 bg-vc-border-light" />
              Access & Permissions
              <span className="h-px flex-1 bg-vc-border-light" />
            </h3>

            {/* Current role display */}
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm text-vc-text-secondary">Organization role:</span>
              <Badge variant={selectedOrgRole === "owner" ? "accent" : selectedOrgRole === "admin" ? "primary" : "default"}>
                {ROLE_LABELS[selectedOrgRole]}
              </Badge>
              {selectedOrgRole === "owner" && (
                <InfoTooltip text="Manages billing and organization settings. Ownership can be transferred on the Organization page." />
              )}
            </div>

            {/* Collapsible role management */}
            {selectedOrgRole !== "owner" && (
              <div>
                <button
                  type="button"
                  onClick={() => setAccessOpen(!accessOpen)}
                  className="flex w-full items-center gap-2 rounded-lg border border-vc-border-light px-4 py-3 text-sm text-vc-text-muted transition-colors hover:bg-vc-bg-warm"
                >
                  <svg
                    className={`h-4 w-4 transition-transform ${accessOpen ? "rotate-90" : ""}`}
                    fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                  <span>Change organization role</span>
                </button>

                <AnimatePresence>
                  {accessOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 rounded-xl border border-vc-border-light bg-white p-4 space-y-3">
                        {selectedOrgRole !== "admin" ? (
                          <button
                            type="button"
                            onClick={() => handleOrgRoleChange("admin")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-vc-border px-3 py-1.5 text-sm font-medium text-vc-text-secondary transition-colors hover:border-vc-indigo/20 hover:text-vc-indigo min-h-[44px]"
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

                        {/* Scheduler scope — show when relevant */}
                        {selectedOrgRole === "scheduler" && selectedMinistries.length > 0 && (
                          <div className="pt-2 border-t border-vc-border-light">
                            <p className="mb-2 text-xs font-semibold text-vc-text-muted">Scheduler access per team:</p>
                            <div className="space-y-1">
                              {selectedMinistries.map((mid) => {
                                const m = ministries.find((x) => x.id === mid);
                                if (!m) return null;
                                const isSchedulerForTeam = ministryScope.includes(mid);
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
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </section>
        )}

        {/* ================================================================
            Section 5 — Actions (collapsible danger zone)
           ================================================================ */}
        {canManage && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-vc-text-muted">
              <span className="h-px flex-1 bg-vc-border-light" />
              Actions
              <span className="h-px flex-1 bg-vc-border-light" />
            </h3>

            {!isArchived ? (
              <div>
                <button
                  type="button"
                  onClick={() => setDangerOpen(!dangerOpen)}
                  className="flex w-full items-center gap-2 rounded-lg border border-vc-border-light px-4 py-3 text-sm text-vc-text-muted transition-colors hover:bg-vc-bg-warm"
                >
                  <svg
                    className={`h-4 w-4 transition-transform ${dangerOpen ? "rotate-90" : ""}`}
                    fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                  <span>Archive or remove this person</span>
                </button>

                <AnimatePresence>
                  {dangerOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 flex flex-wrap gap-2 rounded-lg border border-vc-danger/15 bg-vc-danger/3 p-4">
                        <Button size="sm" variant="ghost" onClick={handleArchive}>
                          <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                          </svg>
                          Archive
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-vc-danger hover:bg-vc-danger/5"
                          onClick={handleRemoveFromOrg}
                        >
                          <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
                          </svg>
                          Remove from Organization
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={onRestore} className="text-vc-sage">
                  <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                  </svg>
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-vc-danger hover:bg-vc-danger/5"
                  onClick={handleRemoveFromOrg}
                >
                  <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
                  </svg>
                  Remove from Organization
                </Button>
              </div>
            )}
          </section>
        )}
      </div>
    </Drawer>

    {/* Photo crop modal */}
    {cropFile && (
      <ImageCropModal
        file={cropFile}
        onCrop={(blob) => {
          setCropFile(null);
          handlePhotoUpload(blob);
        }}
        onCancel={() => setCropFile(null)}
      />
    )}
    </>
  );
}
