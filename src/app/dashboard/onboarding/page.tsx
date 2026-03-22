"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments, updateChurchDocument } from "@/lib/firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { isAdmin } from "@/lib/utils/permissions";
import { getOrgTerms } from "@/lib/utils/org-terms";
import type {
  Volunteer,
  Ministry,
  VolunteerJourneyStep,
  JourneyStepStatus,
  OnboardingStep,
  OrgType,
} from "@/lib/types";
import { ORG_WIDE_MINISTRY_ID } from "@/lib/types";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PrerequisiteEditor } from "@/components/ui/prerequisite-editor";
import { getVolunteerStage, type EligibilityStage } from "@/lib/utils/eligibility";
import { db } from "@/lib/firebase/config";
import { doc, getDoc, updateDoc } from "firebase/firestore";

// ---------------------------------------------------------------------------
// Pipeline Stage
// ---------------------------------------------------------------------------

type PipelineStage = EligibilityStage;

const STAGE_CONFIG: Record<
  PipelineStage,
  { label: string; color: string; bg: string }
> = {
  not_started: {
    label: "Not Started",
    color: "text-vc-text-muted",
    bg: "bg-vc-bg-cream",
  },
  in_progress: {
    label: "In Progress",
    color: "text-vc-sand",
    bg: "bg-vc-sand/15",
  },
  cleared: {
    label: "Cleared to Serve",
    color: "text-vc-sage",
    bg: "bg-vc-sage/15",
  },
};

type Tab = "progress" | "manage";

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const { profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;
  const canManage = isAdmin(activeMembership);

  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [orgType, setOrgType] = useState<OrgType>("church");
  const [orgPrereqs, setOrgPrereqs] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("progress");
  const [selectedMinistry, setSelectedMinistry] = useState<string | "all">(
    "all",
  );
  const [expandedVol, setExpandedVol] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [savingPrereqs, setSavingPrereqs] = useState(false);
  const [expandedManageMinistry, setExpandedManageMinistry] = useState<string | null>(null);

  const terms = getOrgTerms(orgType);

  useEffect(() => {
    if (!churchId) return;
    Promise.all([
      getChurchDocuments(churchId, "volunteers"),
      getChurchDocuments(churchId, "ministries"),
      getDoc(doc(db, "churches", churchId)),
    ])
      .then(([vols, mins, churchSnap]) => {
        setVolunteers(
          (vols as unknown as Volunteer[]).filter((v) => v.status === "active"),
        );
        setMinistries(mins as unknown as Ministry[]);
        if (churchSnap.exists()) {
          const data = churchSnap.data();
          setOrgType(data.org_type || "church");
          setOrgPrereqs(data.org_prerequisites || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [churchId]);

  // Filter ministries that have prerequisites (org-wide or team-specific)
  const hasAnyPrereqs = orgPrereqs.length > 0;
  const ministriesWithPrereqs = hasAnyPrereqs
    ? ministries // all ministries inherit org-wide prereqs
    : ministries.filter((m) => m.prerequisites && m.prerequisites.length > 0);

  // Build pipeline data
  const filteredMinistries =
    selectedMinistry === "all"
      ? ministriesWithPrereqs
      : ministriesWithPrereqs.filter((m) => m.id === selectedMinistry);

  // Count stats
  const pipelineStats = filteredMinistries.map((ministry) => {
    const ministryVols = volunteers.filter(
      (v) =>
        v.ministry_ids.includes(ministry.id) ||
        v.ministry_ids.length === 0,
    );
    const stages: Record<PipelineStage, Volunteer[]> = {
      not_started: [],
      in_progress: [],
      cleared: [],
    };
    for (const vol of ministryVols) {
      const stage = getVolunteerStage(vol, ministry, orgPrereqs);
      stages[stage].push(vol);
    }
    return { ministry, stages };
  });

  async function updateJourneyStep(
    volunteerId: string,
    ministryId: string,
    stepId: string,
    newStatus: JourneyStepStatus,
  ) {
    if (!churchId || !canManage) return;
    setSaving(`${volunteerId}-${stepId}`);

    const vol = volunteers.find((v) => v.id === volunteerId);
    if (!vol) return;

    const journey: VolunteerJourneyStep[] = [
      ...(vol.volunteer_journey || []),
    ];
    const idx = journey.findIndex(
      (j) => j.step_id === stepId && j.ministry_id === ministryId,
    );

    const updatedStep: VolunteerJourneyStep = {
      step_id: stepId,
      ministry_id: ministryId,
      status: newStatus,
      completed_at:
        newStatus === "completed" || newStatus === "waived"
          ? new Date().toISOString()
          : null,
      verified_by:
        newStatus === "completed" || newStatus === "waived"
          ? profile?.id || null
          : null,
      notes: null,
    };

    if (idx >= 0) {
      journey[idx] = updatedStep;
    } else {
      journey.push(updatedStep);
    }

    try {
      await updateChurchDocument(churchId, "volunteers", volunteerId, {
        volunteer_journey: journey,
      });
      setVolunteers((prev) =>
        prev.map((v) =>
          v.id === volunteerId ? { ...v, volunteer_journey: journey } : v,
        ),
      );
    } catch {
      // silent
    } finally {
      setSaving(null);
    }
  }

  async function saveOrgPrereqs(updated: OnboardingStep[]) {
    if (!churchId) return;
    setSavingPrereqs(true);
    try {
      await updateDoc(doc(db, "churches", churchId), {
        org_prerequisites: updated,
      });
      setOrgPrereqs(updated);
    } catch {
      // silent
    } finally {
      setSavingPrereqs(false);
    }
  }

  async function saveMinistryPrereqs(ministryId: string, updated: OnboardingStep[]) {
    if (!churchId) return;
    setSavingPrereqs(true);
    try {
      await updateChurchDocument(churchId, "ministries", ministryId, {
        prerequisites: updated,
      });
      setMinistries((prev) =>
        prev.map((m) =>
          m.id === ministryId ? { ...m, prerequisites: updated } : m,
        ),
      );
    } catch {
      // silent
    } finally {
      setSavingPrereqs(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-3xl text-vc-indigo">
            Volunteer Onboarding
          </h1>
          <InfoTooltip text="Track prerequisite steps — like background checks, training, or orientation — that volunteers complete before being scheduled for a team." />
        </div>
        <p className="mt-1 text-vc-text-secondary">
          Manage prerequisites and track volunteer progress through onboarding
          requirements.
        </p>
      </div>

      {/* Tabs */}
      {canManage && (
        <div className="mb-6 flex gap-1 rounded-lg bg-vc-bg-warm p-1">
          <button
            onClick={() => setActiveTab("progress")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "progress"
                ? "bg-white text-vc-indigo shadow-sm"
                : "text-vc-text-muted hover:text-vc-text"
            }`}
          >
            Volunteer Progress
          </button>
          <button
            onClick={() => setActiveTab("manage")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "manage"
                ? "bg-white text-vc-indigo shadow-sm"
                : "text-vc-text-muted hover:text-vc-text"
            }`}
          >
            Manage Prerequisites
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* MANAGE PREREQUISITES TAB                                          */}
      {/* ================================================================= */}
      {activeTab === "manage" && canManage && (
        <div className="space-y-8">
          {/* Org-Wide Prerequisites */}
          <div className="rounded-xl border border-vc-border bg-white p-6">
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl text-vc-indigo">
                  Organization-Wide Prerequisites
                </h2>
                <InfoTooltip text="These requirements apply to every team. A volunteer must complete all org-wide prerequisites before being scheduled for any team." />
              </div>
              <p className="mt-1 text-sm text-vc-text-muted">
                Requirements every volunteer must complete before serving on any
                team.
              </p>
            </div>
            <PrerequisiteEditor
              prerequisites={orgPrereqs}
              onChange={saveOrgPrereqs}
              label="Org-Wide Requirements"
            />
            {savingPrereqs && (
              <p className="mt-2 text-xs text-vc-text-muted">Saving…</p>
            )}
          </div>

          {/* Team-Specific Prerequisites */}
          <div className="rounded-xl border border-vc-border bg-white p-6">
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl text-vc-indigo">
                  Team-Specific Prerequisites
                </h2>
                <InfoTooltip text="Additional requirements for individual teams. These are checked on top of any org-wide prerequisites." />
              </div>
              <p className="mt-1 text-sm text-vc-text-muted">
                Additional requirements for specific {terms.pluralLower}. These
                are in addition to any organization-wide prerequisites above.
              </p>
            </div>

            {ministries.length === 0 ? (
              <p className="text-sm text-vc-text-muted">
                No {terms.pluralLower} created yet. Create a{" "}
                {terms.singularLower} in Organization settings first.
              </p>
            ) : (
              <div className="space-y-3">
                {ministries.map((ministry) => {
                  const isExpanded = expandedManageMinistry === ministry.id;
                  const prereqCount = ministry.prerequisites?.length || 0;
                  return (
                    <div
                      key={ministry.id}
                      className="rounded-lg border border-vc-border-light overflow-hidden"
                    >
                      <button
                        onClick={() =>
                          setExpandedManageMinistry(
                            isExpanded ? null : ministry.id,
                          )
                        }
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-vc-bg-warm/30 transition-colors"
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: ministry.color }}
                        />
                        <span className="flex-1 text-sm font-medium text-vc-indigo">
                          {ministry.name}
                        </span>
                        <span className="text-xs text-vc-text-muted">
                          {prereqCount} prerequisite
                          {prereqCount !== 1 ? "s" : ""}
                        </span>
                        <svg
                          className={`h-4 w-4 text-vc-text-muted transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m19.5 8.25-7.5 7.5-7.5-7.5"
                          />
                        </svg>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-vc-border-light px-4 py-3">
                          <PrerequisiteEditor
                            prerequisites={ministry.prerequisites || []}
                            onChange={(updated) =>
                              saveMinistryPrereqs(ministry.id, updated)
                            }
                            label={`${ministry.name} Requirements`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* VOLUNTEER PROGRESS TAB                                            */}
      {/* ================================================================= */}
      {activeTab === "progress" && (
        <>
          {ministriesWithPrereqs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
              <svg
                className="mx-auto h-8 w-8 text-vc-text-muted/50"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342"
                />
              </svg>
              <p className="mt-3 text-vc-text-secondary">
                No prerequisites configured yet.
              </p>
              {canManage && (
                <p className="mt-1 text-sm text-vc-text-muted">
                  Switch to the{" "}
                  <button
                    onClick={() => setActiveTab("manage")}
                    className="font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
                  >
                    Manage Prerequisites
                  </button>{" "}
                  tab to add org-wide or team-specific requirements.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Ministry filter */}
              <div className="mb-6 flex items-center gap-3">
                <label className="text-sm font-medium text-vc-text">
                  {terms.singular}:
                </label>
                <select
                  className="rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none"
                  value={selectedMinistry}
                  onChange={(e) => setSelectedMinistry(e.target.value)}
                >
                  <option value="all">All {terms.pluralLower}</option>
                  {ministriesWithPrereqs.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pipeline columns */}
              {pipelineStats.map(({ ministry, stages }) => {
                const teamPrereqs = ministry.prerequisites || [];
                const allPrereqs = [
                  ...orgPrereqs.map((p) => ({
                    ...p,
                    _ministryId: ORG_WIDE_MINISTRY_ID,
                    _isOrgWide: true as const,
                  })),
                  ...teamPrereqs.map((p) => ({
                    ...p,
                    _ministryId: ministry.id,
                    _isOrgWide: false as const,
                  })),
                ];
                const totalPrereqCount = allPrereqs.length;

                return (
                  <div key={ministry.id} className="mb-8">
                    <div className="mb-4 flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: ministry.color }}
                      />
                      <h2 className="font-display text-xl text-vc-indigo">
                        {ministry.name}
                      </h2>
                      <span className="text-sm text-vc-text-muted">
                        {totalPrereqCount} prerequisite
                        {totalPrereqCount !== 1 ? "s" : ""}
                        {orgPrereqs.length > 0 && teamPrereqs.length > 0 && (
                          <span className="ml-1 text-[10px]">
                            ({orgPrereqs.length} org-wide + {teamPrereqs.length}{" "}
                            team)
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Stage summary cards */}
                    <div className="mb-4 grid grid-cols-3 gap-3">
                      {(
                        ["not_started", "in_progress", "cleared"] as PipelineStage[]
                      ).map((stage) => {
                        const cfg = STAGE_CONFIG[stage];
                        return (
                          <div
                            key={stage}
                            className={`rounded-xl ${cfg.bg} p-4 text-center`}
                          >
                            <p className={`text-2xl font-bold ${cfg.color}`}>
                              {stages[stage].length}
                            </p>
                            <p className="text-xs text-vc-text-muted">
                              {cfg.label}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Prerequisites list */}
                    <div className="mb-2 flex flex-wrap gap-2">
                      {allPrereqs.map((prereq) => (
                        <span
                          key={`${prereq._ministryId}-${prereq.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-vc-bg-warm px-3 py-1 text-xs font-medium text-vc-text-secondary"
                        >
                          <span className="capitalize text-[10px] text-vc-text-muted">
                            {prereq._isOrgWide ? "org" : prereq.type}
                          </span>
                          {prereq.label}
                        </span>
                      ))}
                    </div>

                    {/* Volunteer list */}
                    <div className="rounded-xl border border-vc-border bg-white overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-vc-border-light bg-vc-bg-warm/50">
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-vc-text-muted uppercase tracking-wider">
                              Volunteer
                            </th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-vc-text-muted uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-vc-text-muted uppercase tracking-wider">
                              Progress
                            </th>
                            {canManage && (
                              <th className="px-4 py-2.5 text-right text-xs font-semibold text-vc-text-muted uppercase tracking-wider">
                                Actions
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-vc-border-light">
                          {[
                            ...stages.in_progress,
                            ...stages.not_started,
                            ...stages.cleared,
                          ].map((vol) => {
                            const stage = getVolunteerStage(
                              vol,
                              ministry,
                              orgPrereqs,
                            );
                            const cfg = STAGE_CONFIG[stage];
                            const journey = vol.volunteer_journey || [];
                            const completedCount = allPrereqs.filter((p) => {
                              const step = journey.find(
                                (j) =>
                                  j.step_id === p.id &&
                                  j.ministry_id === p._ministryId,
                              );
                              return (
                                step?.status === "completed" ||
                                step?.status === "waived"
                              );
                            }).length;
                            const isExpanded =
                              expandedVol === `${vol.id}-${ministry.id}`;

                            return (
                              <tr
                                key={vol.id}
                                className="hover:bg-vc-bg-warm/30 transition-colors"
                              >
                                <td className="px-4 py-3">
                                  <button
                                    className="text-left"
                                    onClick={() =>
                                      setExpandedVol(
                                        isExpanded
                                          ? null
                                          : `${vol.id}-${ministry.id}`,
                                      )
                                    }
                                  >
                                    <p className="font-medium text-vc-indigo">
                                      {vol.name}
                                    </p>
                                    <p className="text-xs text-vc-text-muted">
                                      {vol.email}
                                    </p>
                                  </button>
                                  {isExpanded && canManage && (
                                    <div className="mt-3 space-y-2 pl-1">
                                      {orgPrereqs.length > 0 && (
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-vc-text-muted">
                                          Org-Wide
                                        </p>
                                      )}
                                      {orgPrereqs.map((prereq) => {
                                        const step = journey.find(
                                          (j) =>
                                            j.step_id === prereq.id &&
                                            j.ministry_id ===
                                              ORG_WIDE_MINISTRY_ID,
                                        );
                                        const stepStatus: JourneyStepStatus =
                                          step?.status || "pending";
                                        return (
                                          <div
                                            key={`org-${prereq.id}`}
                                            className="flex items-center gap-2"
                                          >
                                            <select
                                              className="rounded border border-vc-border bg-white px-2 py-1 text-xs focus:border-vc-coral focus:outline-none"
                                              value={stepStatus}
                                              disabled={
                                                saving ===
                                                `${vol.id}-${prereq.id}`
                                              }
                                              onChange={(e) =>
                                                updateJourneyStep(
                                                  vol.id,
                                                  ORG_WIDE_MINISTRY_ID,
                                                  prereq.id,
                                                  e.target
                                                    .value as JourneyStepStatus,
                                                )
                                              }
                                            >
                                              <option value="pending">
                                                Pending
                                              </option>
                                              <option value="in_progress">
                                                In Progress
                                              </option>
                                              <option value="completed">
                                                Completed
                                              </option>
                                              <option value="waived">
                                                Waived
                                              </option>
                                            </select>
                                            <span className="text-xs text-vc-text-secondary">
                                              {prereq.label}
                                            </span>
                                            {step?.completed_at && (
                                              <span className="text-[10px] text-vc-text-muted">
                                                {new Date(
                                                  step.completed_at,
                                                ).toLocaleDateString()}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                      {teamPrereqs.length > 0 &&
                                        orgPrereqs.length > 0 && (
                                          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-vc-text-muted">
                                            Team-Specific
                                          </p>
                                        )}
                                      {teamPrereqs.map((prereq) => {
                                        const step = journey.find(
                                          (j) =>
                                            j.step_id === prereq.id &&
                                            j.ministry_id === ministry.id,
                                        );
                                        const stepStatus: JourneyStepStatus =
                                          step?.status || "pending";
                                        return (
                                          <div
                                            key={`team-${prereq.id}`}
                                            className="flex items-center gap-2"
                                          >
                                            <select
                                              className="rounded border border-vc-border bg-white px-2 py-1 text-xs focus:border-vc-coral focus:outline-none"
                                              value={stepStatus}
                                              disabled={
                                                saving ===
                                                `${vol.id}-${prereq.id}`
                                              }
                                              onChange={(e) =>
                                                updateJourneyStep(
                                                  vol.id,
                                                  ministry.id,
                                                  prereq.id,
                                                  e.target
                                                    .value as JourneyStepStatus,
                                                )
                                              }
                                            >
                                              <option value="pending">
                                                Pending
                                              </option>
                                              <option value="in_progress">
                                                In Progress
                                              </option>
                                              <option value="completed">
                                                Completed
                                              </option>
                                              <option value="waived">
                                                Waived
                                              </option>
                                            </select>
                                            <span className="text-xs text-vc-text-secondary">
                                              {prereq.label}
                                            </span>
                                            {step?.completed_at && (
                                              <span className="text-[10px] text-vc-text-muted">
                                                {new Date(
                                                  step.completed_at,
                                                ).toLocaleDateString()}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}
                                  >
                                    {cfg.label}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-24 rounded-full bg-vc-bg-cream overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-vc-sage transition-all"
                                        style={{
                                          width: `${totalPrereqCount > 0 ? (completedCount / totalPrereqCount) * 100 : 0}%`,
                                        }}
                                      />
                                    </div>
                                    <span className="text-xs text-vc-text-muted">
                                      {completedCount}/{totalPrereqCount}
                                    </span>
                                  </div>
                                </td>
                                {canManage && (
                                  <td className="px-4 py-3 text-right">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        setExpandedVol(
                                          isExpanded
                                            ? null
                                            : `${vol.id}-${ministry.id}`,
                                        )
                                      }
                                    >
                                      {isExpanded ? "Collapse" : "Manage"}
                                    </Button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                          {stages.in_progress.length === 0 &&
                            stages.not_started.length === 0 &&
                            stages.cleared.length === 0 && (
                              <tr>
                                <td
                                  colSpan={canManage ? 4 : 3}
                                  className="px-4 py-8 text-center text-sm text-vc-text-muted"
                                >
                                  No volunteers assigned to this{" "}
                                  {terms.singularLower}.
                                </td>
                              </tr>
                            )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}
