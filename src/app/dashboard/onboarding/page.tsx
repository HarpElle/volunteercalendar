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
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";

// ---------------------------------------------------------------------------
// Pipeline Stage
// ---------------------------------------------------------------------------

type PipelineStage = "not_started" | "in_progress" | "cleared";

function getVolunteerStage(
  volunteer: Volunteer,
  ministry: Ministry,
): PipelineStage {
  const prereqs = ministry.prerequisites;
  if (!prereqs || prereqs.length === 0) return "cleared";

  const journey = volunteer.volunteer_journey || [];
  const completed = prereqs.filter((p) => {
    const step = journey.find(
      (j) => j.step_id === p.id && j.ministry_id === ministry.id,
    );
    return step?.status === "completed" || step?.status === "waived";
  });

  if (completed.length === prereqs.length) return "cleared";
  if (completed.length > 0) return "in_progress";

  // Check if any steps are in_progress
  const hasInProgress = prereqs.some((p) => {
    const step = journey.find(
      (j) => j.step_id === p.id && j.ministry_id === ministry.id,
    );
    return step?.status === "in_progress";
  });

  return hasInProgress ? "in_progress" : "not_started";
}

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
  const [loading, setLoading] = useState(true);
  const [selectedMinistry, setSelectedMinistry] = useState<string | "all">(
    "all",
  );
  const [expandedVol, setExpandedVol] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

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
          setOrgType(churchSnap.data().org_type || "church");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [churchId]);

  // Filter ministries that have prerequisites
  const ministriesWithPrereqs = ministries.filter(
    (m) => m.prerequisites && m.prerequisites.length > 0,
  );

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
      const stage = getVolunteerStage(vol, ministry);
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
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-3xl text-vc-indigo">
            Volunteer Onboarding
          </h1>
          <InfoTooltip text="Track prerequisite steps — like background checks, training, or orientation — that volunteers complete before being scheduled for a team." />
        </div>
        <p className="mt-1 text-vc-text-secondary">
          Track volunteer progress through {terms.singularLower} prerequisites
          and onboarding requirements.
        </p>
      </div>

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
            No {terms.pluralLower} have prerequisites configured.
          </p>
          <p className="mt-1 text-sm text-vc-text-muted">
            Add prerequisites to a {terms.singularLower} in the Organization
            settings to start tracking volunteer onboarding.
          </p>
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
          {pipelineStats.map(({ ministry, stages }) => (
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
                  {ministry.prerequisites?.length || 0} prerequisite
                  {(ministry.prerequisites?.length || 0) !== 1 ? "s" : ""}
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
                      <p className="text-xs text-vc-text-muted">{cfg.label}</p>
                    </div>
                  );
                })}
              </div>

              {/* Prerequisites list */}
              <div className="mb-2 flex flex-wrap gap-2">
                {ministry.prerequisites?.map((prereq) => (
                  <span
                    key={prereq.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-vc-bg-warm px-3 py-1 text-xs font-medium text-vc-text-secondary"
                  >
                    <span className="capitalize text-[10px] text-vc-text-muted">
                      {prereq.type}
                    </span>
                    {prereq.label}
                  </span>
                ))}
              </div>

              {/* Volunteer list (in_progress + not_started) */}
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
                    {[...stages.in_progress, ...stages.not_started, ...stages.cleared].map(
                      (vol) => {
                        const stage = getVolunteerStage(vol, ministry);
                        const cfg = STAGE_CONFIG[stage];
                        const prereqs = ministry.prerequisites || [];
                        const journey = vol.volunteer_journey || [];
                        const completedCount = prereqs.filter((p) => {
                          const step = journey.find(
                            (j) =>
                              j.step_id === p.id &&
                              j.ministry_id === ministry.id,
                          );
                          return (
                            step?.status === "completed" ||
                            step?.status === "waived"
                          );
                        }).length;
                        const isExpanded = expandedVol === `${vol.id}-${ministry.id}`;

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
                                  {prereqs.map((prereq) => {
                                    const step = journey.find(
                                      (j) =>
                                        j.step_id === prereq.id &&
                                        j.ministry_id === ministry.id,
                                    );
                                    const stepStatus: JourneyStepStatus =
                                      step?.status || "pending";
                                    return (
                                      <div
                                        key={prereq.id}
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
                                          <option value="waived">Waived</option>
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
                                      width: `${prereqs.length > 0 ? (completedCount / prereqs.length) * 100 : 0}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-xs text-vc-text-muted">
                                  {completedCount}/{prereqs.length}
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
                      },
                    )}
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
          ))}
        </>
      )}
    </div>
  );
}
