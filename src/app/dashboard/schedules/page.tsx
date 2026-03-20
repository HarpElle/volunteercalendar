"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/context/auth-context";
import {
  addChurchDocument,
  getChurchDocuments,
  updateChurchDocument,
  removeChurchDocument,
} from "@/lib/firebase/firestore";
import { generateDraftSchedule } from "@/lib/services/scheduler";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScheduleMatrix } from "@/components/scheduling/schedule-matrix";
import { MinistryReviewPanel } from "@/components/scheduling/ministry-review-panel";
import type {
  Schedule,
  ScheduleStatus,
  Service,
  Volunteer,
  Ministry,
  Household,
  Assignment,
  ScheduleConflict,
  SchedulingResult,
  MinistryApproval,
  OnboardingStep,
} from "@/lib/types";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";

const VALID_TRANSITIONS: Record<string, ScheduleStatus[]> = {
  draft: ["in_review"],
  in_review: ["draft", "approved"],
  approved: ["in_review", "published"],
  published: ["archived"],
  archived: [],
};

export default function SchedulesPage() {
  const { profile, user } = useAuth();
  const churchId = profile?.church_id;

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [orgPrerequisites, setOrgPrerequisites] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState("");

  // Create form
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + (7 - d.getDay()));
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + (7 - d.getDay()) + 27);
    return d.toISOString().split("T")[0];
  });

  // Active schedule view
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [activeAssignments, setActiveAssignments] = useState<Assignment[]>([]);
  const [activeConflicts, setActiveConflicts] = useState<ScheduleConflict[]>([]);
  const [activeStats, setActiveStats] = useState<SchedulingResult["stats"] | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [notifyResult, setNotifyResult] = useState<string | null>(null);
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (!churchId) return;
    async function load() {
      try {
        const [scheds, svcs, vols, mins, hhs, churchSnap] = await Promise.all([
          getChurchDocuments(churchId!, "schedules"),
          getChurchDocuments(churchId!, "services"),
          getChurchDocuments(churchId!, "volunteers"),
          getChurchDocuments(churchId!, "ministries"),
          getChurchDocuments(churchId!, "households").catch(() => []),
          getDoc(doc(db, "churches", churchId!)),
        ]);
        setSchedules(scheds as unknown as Schedule[]);
        setServices(svcs as unknown as Service[]);
        setVolunteers(vols as unknown as Volunteer[]);
        setMinistries(mins as unknown as Ministry[]);
        setHouseholds(hhs as unknown as Household[]);
        if (churchSnap.exists()) {
          setOrgPrerequisites(churchSnap.data().org_prerequisites || []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!churchId || !user) return;
    setGenerating(true);

    try {
      const scheduleData: Omit<Schedule, "id"> = {
        church_id: churchId,
        date_range_start: startDate,
        date_range_end: endDate,
        status: "draft",
        workflow_mode: "centralized",
        created_by: user.uid,
        created_at: new Date().toISOString(),
        published_at: null,
        ministry_approvals: {},
        notes: null,
      };
      const schedRef = await addChurchDocument(churchId, "schedules", scheduleData);
      const scheduleId = schedRef.id;

      const result = generateDraftSchedule(
        scheduleId, churchId, services, volunteers, households, startDate, endDate, ministries, orgPrerequisites,
      );

      const savedAssignments: Assignment[] = [];
      for (const a of result.assignments) {
        const assignmentData = {
          ...a,
          confirmation_token: crypto.randomUUID(),
          responded_at: null,
          reminder_sent_at: [],
        };
        const ref = await addChurchDocument(churchId, "assignments", assignmentData);
        savedAssignments.push({ id: ref.id, ...assignmentData });
      }

      const newSchedule = { id: scheduleId, ...scheduleData } as Schedule;
      setSchedules((prev) => [newSchedule, ...prev]);
      setActiveScheduleId(scheduleId);
      setActiveAssignments(savedAssignments);
      setActiveConflicts(result.conflicts);
      setActiveStats(result.stats);
      setShowCreate(false);
    } catch {
      setMutationError("Failed to generate schedule. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function viewSchedule(schedule: Schedule) {
    if (!churchId) return;
    setActiveScheduleId(schedule.id);
    setActiveStats(null);
    setShowReview(false);
    setScheduleNotes(schedule.notes || "");

    try {
      const allAssignments = await getChurchDocuments(churchId, "assignments");
      const schedAssignments = (allAssignments as unknown as Assignment[]).filter(
        (a) => a.schedule_id === schedule.id
      );
      setActiveAssignments(schedAssignments);
      const totalSlots = services.reduce(
        (sum, s) => sum + s.roles.reduce((rs, r) => rs + r.count, 0), 0,
      );
      setActiveStats({
        total_slots: totalSlots,
        filled_slots: schedAssignments.length,
        fill_rate: totalSlots > 0 ? Math.round((schedAssignments.length / totalSlots) * 100) : 0,
        fairness_score: 0,
      });
    } catch {
      // silent
    }
  }

  async function handleDeleteSchedule(id: string) {
    if (!churchId) return;
    setDeleting(id);
    try {
      const allAssignments = await getChurchDocuments(churchId, "assignments");
      const schedAssignments = (allAssignments as unknown as Assignment[]).filter(
        (a) => a.schedule_id === id
      );
      for (const a of schedAssignments) {
        await removeChurchDocument(churchId, "assignments", a.id);
      }
      await removeChurchDocument(churchId, "schedules", id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      if (activeScheduleId === id) {
        setActiveScheduleId(null);
        setActiveAssignments([]);
        setActiveConflicts([]);
        setActiveStats(null);
      }
      setMutationError("");
    } catch {
      setMutationError("Failed to delete schedule. Please try again.");
    } finally {
      setDeleting(null);
    }
  }

  async function saveNotes() {
    if (!churchId || !activeScheduleId) return;
    setSavingNotes(true);
    try {
      await updateChurchDocument(churchId, "schedules", activeScheduleId, {
        notes: scheduleNotes || null,
      });
      // Update local state
      setSchedules((prev) =>
        prev.map((s) => (s.id === activeScheduleId ? { ...s, notes: scheduleNotes || null } : s)),
      );
    } catch {
      setMutationError("Failed to save notes.");
    } finally {
      setSavingNotes(false);
    }
  }

  // --- Workflow Transitions ---

  async function transitionStatus(newStatus: ScheduleStatus) {
    if (!churchId || !activeScheduleId) return;
    setTransitioning(true);
    try {
      const updates: Record<string, unknown> = { status: newStatus };

      // When sending for review, init ministry approvals
      if (newStatus === "in_review") {
        const approvals: Record<string, MinistryApproval> = {};
        const ministryIds = new Set(activeAssignments.map((a) => a.ministry_id));
        for (const mid of ministryIds) {
          approvals[mid] = {
            status: "pending",
            approved_by: null,
            approved_at: null,
            notes: null,
          };
        }
        updates.ministry_approvals = approvals;
      }

      if (newStatus === "published") {
        updates.published_at = new Date().toISOString();
      }

      await updateChurchDocument(churchId, "schedules", activeScheduleId, updates);
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === activeScheduleId ? { ...s, ...updates } as Schedule : s
        )
      );

      // After publishing, send notification emails to all volunteers
      if (newStatus === "published") {
        setNotifyResult(null);
        try {
          const res = await fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              church_id: churchId,
              schedule_id: activeScheduleId,
            }),
          });
          const result = await res.json();
          if (result.success) {
            setNotifyResult(
              `Sent ${result.sent} confirmation email${result.sent !== 1 ? "s" : ""}` +
              (result.skipped ? ` (${result.skipped} skipped)` : "")
            );
          } else {
            setNotifyResult(result.error || "Email sending failed");
          }
        } catch {
          setNotifyResult("Could not send notification emails — check RESEND_API_KEY");
        }
      }
    } catch {
      setMutationError("Failed to update schedule status. Please try again.");
    } finally {
      setTransitioning(false);
    }
  }

  async function handleMinistryApproval(ministryId: string, status: "approved" | "rejected") {
    if (!churchId || !activeScheduleId || !user) return;
    setTransitioning(true);
    try {
      const approval: MinistryApproval = {
        status,
        approved_by: user.uid,
        approved_at: new Date().toISOString(),
        notes: null,
      };

      const schedule = schedules.find((s) => s.id === activeScheduleId);
      if (!schedule) return;

      const newApprovals = {
        ...schedule.ministry_approvals,
        [ministryId]: approval,
      };

      await updateChurchDocument(churchId, "schedules", activeScheduleId, {
        ministry_approvals: newApprovals,
      });

      setSchedules((prev) =>
        prev.map((s) =>
          s.id === activeScheduleId
            ? { ...s, ministry_approvals: newApprovals }
            : s
        )
      );
    } catch {
      setMutationError("Failed to update ministry approval. Please try again.");
    } finally {
      setTransitioning(false);
    }
  }

  // --- Manual Override ---

  async function handleReassign(assignmentId: string, newVolunteerId: string) {
    if (!churchId) return;
    try {
      const newVol = volunteers.find((v) => v.id === newVolunteerId);
      await updateChurchDocument(churchId, "assignments", assignmentId, {
        volunteer_id: newVolunteerId,
      });
      setActiveAssignments((prev) =>
        prev.map((a) =>
          a.id === assignmentId ? { ...a, volunteer_id: newVolunteerId } : a
        )
      );
    } catch {
      setMutationError("Failed to reassign volunteer. Please try again.");
    }
  }

  async function handleUnassign(assignmentId: string) {
    if (!churchId) return;
    try {
      await removeChurchDocument(churchId, "assignments", assignmentId);
      setActiveAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    } catch {
      setMutationError("Failed to unassign volunteer. Please try again.");
    }
  }

  const activeSchedule = schedules.find((s) => s.id === activeScheduleId);
  const canGenerate = services.length > 0 && volunteers.length > 0;

  const statusColors: Record<string, string> = {
    draft: "default",
    in_review: "warning",
    approved: "primary",
    published: "success",
    archived: "default",
  };

  // Determine available actions for the current schedule
  const nextStatuses = activeSchedule
    ? VALID_TRANSITIONS[activeSchedule.status] || []
    : [];

  const allMinistriesApproved = activeSchedule
    ? Object.values(activeSchedule.ministry_approvals).length > 0 &&
      Object.values(activeSchedule.ministry_approvals).every((a) => a.status === "approved")
    : false;

  function statusActionLabel(status: ScheduleStatus): string {
    switch (status) {
      case "in_review": return "Send for Review";
      case "draft": return "Back to Draft";
      case "approved": return "Approve Schedule";
      case "published": return "Publish";
      case "archived": return "Archive";
    }
  }

  function statusActionVariant(status: ScheduleStatus): "primary" | "secondary" | "outline" | "ghost" | "danger" {
    switch (status) {
      case "published": return "primary";
      case "approved": return "secondary";
      case "in_review": return "outline";
      default: return "ghost";
    }
  }

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">Schedules</h1>
          <p className="mt-1 text-vc-text-secondary">
            Generate and manage volunteer schedules.
          </p>
        </div>
        {!showCreate && !activeScheduleId && (
          <Button onClick={() => setShowCreate(true)} disabled={!canGenerate}>
            New Schedule
          </Button>
        )}
      </div>

      {mutationError && (
        <div className="mb-6 rounded-xl border border-vc-danger/20 bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
          {mutationError}
        </div>
      )}

      {!canGenerate && !loading && (
        <div className="mb-6 rounded-lg bg-vc-sand/20 px-4 py-3 text-sm text-vc-text-secondary">
          Add at least one service and one volunteer before generating a schedule.
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="mb-8 rounded-xl border border-vc-border-light bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-vc-indigo">Generate Draft Schedule</h2>
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Start Date" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <Input label="End Date" type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="rounded-lg bg-vc-bg-warm px-4 py-3 text-sm text-vc-text-secondary">
              <strong>{services.length}</strong> service{services.length !== 1 ? "s" : ""} and{" "}
              <strong>{volunteers.length}</strong> volunteer{volunteers.length !== 1 ? "s" : ""} will
              be included.
            </div>
            <div className="flex gap-3">
              <Button type="submit" loading={generating}>
                {generating ? "Generating..." : "Generate Draft"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* Active schedule view */}
      {activeScheduleId && activeSchedule && (
        <div className="mb-8">
          {/* Header */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setActiveScheduleId(null);
                  setActiveAssignments([]);
                  setActiveConflicts([]);
                  setActiveStats(null);
                  setShowReview(false);
                }}
                className="text-sm text-vc-text-secondary hover:text-vc-coral transition-colors"
              >
                &larr; All schedules
              </button>
              <Badge variant={statusColors[activeSchedule.status] as "default" | "primary" | "success" | "warning" | "danger"}>
                {activeSchedule.status.replace("_", " ")}
              </Badge>
              <span className="text-sm text-vc-text-muted">
                {activeSchedule.date_range_start} to {activeSchedule.date_range_end}
              </span>
            </div>

            {/* Export + Workflow actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  window.open(
                    `/api/export?church_id=${churchId}&schedule_id=${activeScheduleId}&format=csv`,
                    "_blank"
                  );
                }}
              >
                <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                CSV
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.print()}
              >
                <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.75 12h.008v.008h-.008V12Zm-12 0h.008v.008H6.75V12Z" />
                </svg>
                Print / PDF
              </Button>
              {activeSchedule.status === "in_review" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowReview(!showReview)}
                >
                  {showReview ? "Hide Review" : "Ministry Review"}
                </Button>
              )}
              {nextStatuses.map((next) => {
                // Block "approved" if not all ministries approved (during in_review)
                const blocked =
                  next === "approved" &&
                  activeSchedule.status === "in_review" &&
                  !allMinistriesApproved;

                return (
                  <Button
                    key={next}
                    size="sm"
                    variant={statusActionVariant(next)}
                    loading={transitioning}
                    disabled={blocked}
                    onClick={() => transitionStatus(next)}
                    title={blocked ? "All ministries must approve first" : undefined}
                  >
                    {statusActionLabel(next)}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Workflow progress bar */}
          <div className="mb-4 flex items-center gap-1">
            {(["draft", "in_review", "approved", "published"] as ScheduleStatus[]).map((step, i) => {
              const steps: ScheduleStatus[] = ["draft", "in_review", "approved", "published"];
              const currentIdx = steps.indexOf(activeSchedule.status);
              const stepIdx = i;
              const isActive = stepIdx <= currentIdx;
              return (
                <div key={step} className="flex flex-1 items-center gap-1">
                  <div
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      isActive ? "bg-vc-coral" : "bg-vc-border"
                    }`}
                  />
                  {i < 3 && <div className="h-1 w-1" />}
                </div>
              );
            })}
          </div>
          <div className="mb-6 flex justify-between text-xs text-vc-text-muted">
            <span>Draft</span>
            <span>In Review</span>
            <span>Approved</span>
            <span>Published</span>
          </div>

          {/* Stats bar */}
          {activeStats && (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-white border border-vc-border-light px-4 py-3">
                <p className="text-xs font-medium text-vc-text-muted">Total Slots</p>
                <p className="text-xl font-semibold text-vc-indigo">{activeStats.total_slots}</p>
              </div>
              <div className="rounded-lg bg-white border border-vc-border-light px-4 py-3">
                <p className="text-xs font-medium text-vc-text-muted">Filled</p>
                <p className="text-xl font-semibold text-vc-sage">{activeStats.filled_slots}</p>
              </div>
              <div className="rounded-lg bg-white border border-vc-border-light px-4 py-3">
                <p className="text-xs font-medium text-vc-text-muted">Fill Rate</p>
                <p className={`text-xl font-semibold ${activeStats.fill_rate >= 80 ? "text-vc-sage" : activeStats.fill_rate >= 50 ? "text-vc-sand-dark" : "text-vc-danger"}`}>
                  {activeStats.fill_rate}%
                </p>
              </div>
              <div className="rounded-lg bg-white border border-vc-border-light px-4 py-3">
                <p className="text-xs font-medium text-vc-text-muted">Fairness</p>
                <p className="text-xl font-semibold text-vc-indigo">{activeStats.fairness_score}%</p>
              </div>
            </div>
          )}

          {/* Email notification result */}
          {notifyResult && (
            <div className="mb-4 rounded-lg bg-vc-bg-warm px-4 py-3 text-sm text-vc-text-secondary flex items-center justify-between">
              <span>{notifyResult}</span>
              <button onClick={() => setNotifyResult(null)} className="text-vc-text-muted hover:text-vc-indigo">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Published — Confirmation Tracker */}
          {activeSchedule.status === "published" && activeAssignments.length > 0 && (
            <div className="mb-4 rounded-xl border border-vc-sage/20 bg-vc-sage/5 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-vc-sage flex items-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  Schedule Published
                </h3>
                <span className="text-xs text-vc-text-muted">
                  {activeSchedule.published_at && new Date(activeSchedule.published_at).toLocaleDateString()}
                </span>
              </div>
              {(() => {
                const confirmed = activeAssignments.filter((a) => a.status === "confirmed").length;
                const declined = activeAssignments.filter((a) => a.status === "declined").length;
                const pending = activeAssignments.filter((a) => a.status === "draft").length;
                const total = activeAssignments.length;
                return (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <span className="text-vc-sage font-medium">{confirmed} confirmed</span>
                      <span className="text-vc-danger font-medium">{declined} declined</span>
                      <span className="text-vc-text-muted">{pending} awaiting</span>
                    </div>
                    <div className="h-2 rounded-full bg-vc-border overflow-hidden flex">
                      {confirmed > 0 && (
                        <div className="bg-vc-sage h-full transition-all" style={{ width: `${(confirmed / total) * 100}%` }} />
                      )}
                      {declined > 0 && (
                        <div className="bg-vc-danger h-full transition-all" style={{ width: `${(declined / total) * 100}%` }} />
                      )}
                    </div>
                    <p className="text-xs text-vc-text-muted">
                      Volunteers can confirm or decline via their personal confirmation link.
                      Confirmation links: <code className="bg-vc-bg-warm px-1 rounded">/confirm/[token]</code>
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Conflicts */}
          {activeConflicts.length > 0 && (
            <div className="mb-4 rounded-xl border border-vc-danger/20 bg-vc-danger/5 p-4">
              <h3 className="text-sm font-semibold text-vc-danger">
                {activeConflicts.length} Conflict{activeConflicts.length !== 1 ? "s" : ""}
              </h3>
              <ul className="mt-2 space-y-1">
                {activeConflicts.slice(0, 10).map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-vc-text-secondary">
                    <Badge variant={c.type === "unfilled_role" ? "danger" : c.type === "overbooked" ? "warning" : "default"}>
                      {c.type.replace("_", " ")}
                    </Badge>
                    <span>{c.message}</span>
                  </li>
                ))}
                {activeConflicts.length > 10 && (
                  <li className="text-sm text-vc-text-muted">+ {activeConflicts.length - 10} more</li>
                )}
              </ul>
            </div>
          )}

          {/* Service Notes */}
          <div className="mb-6 rounded-xl border border-vc-border-light bg-white overflow-hidden shadow-sm">
            <div className="border-b border-vc-border-light px-5 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-vc-indigo">Service Notes</h3>
              {scheduleNotes !== (activeSchedule.notes || "") && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={savingNotes}
                  onClick={saveNotes}
                >
                  Save Notes
                </Button>
              )}
            </div>
            <div className="p-4">
              <textarea
                className="w-full rounded-lg border border-vc-border-light bg-vc-bg px-3 py-2 text-sm text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-1 focus:ring-vc-coral/30 transition-colors min-h-[100px] resize-y"
                placeholder="Set list, resource links, announcements, or any notes for this schedule period..."
                value={scheduleNotes}
                onChange={(e) => setScheduleNotes(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-vc-text-muted">
                Notes are visible to schedulers and team leads. Use for set lists, rehearsal times, or resource links.
              </p>
            </div>
          </div>

          {/* Ministry Review Panel */}
          {showReview && activeSchedule.status === "in_review" && (
            <div className="mb-6">
              <MinistryReviewPanel
                schedule={activeSchedule}
                assignments={activeAssignments}
                ministries={ministries}
                services={services}
                volunteers={volunteers}
                onApprove={(mid) => handleMinistryApproval(mid, "approved")}
                onReject={(mid) => handleMinistryApproval(mid, "rejected")}
                loading={transitioning}
              />
            </div>
          )}

          {/* Matrix */}
          <ScheduleMatrix
            assignments={activeAssignments}
            services={services}
            volunteers={volunteers}
            ministries={ministries}
            schedule={activeSchedule}
            onReassign={activeSchedule.status === "draft" ? handleReassign : undefined}
            onUnassign={activeSchedule.status === "draft" ? handleUnassign : undefined}
          />
        </div>
      )}

      {/* Schedule list */}
      {!activeScheduleId && (
        <>
          {loading ? (
            <div className="py-12 flex justify-center"><Spinner /></div>
          ) : schedules.length === 0 && !showCreate ? (
            <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
              <p className="text-vc-text-secondary">No schedules yet.</p>
              <p className="mt-1 text-sm text-vc-text-muted">
                Generate a draft schedule to auto-assign volunteers to services.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map((s) => (
                <div key={s.id} className="group rounded-xl border border-vc-border-light bg-white p-5 transition-shadow hover:shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => viewSchedule(s)}
                        className="font-semibold text-vc-indigo hover:text-vc-coral transition-colors"
                      >
                        {s.date_range_start} — {s.date_range_end}
                      </button>
                      <Badge variant={statusColors[s.status] as "default" | "primary" | "success" | "warning" | "danger"}>
                        {s.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="flex gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => viewSchedule(s)} className="text-xs font-medium text-vc-text-secondary hover:text-vc-coral transition-colors">View</button>
                      {s.status === "draft" && (
                        <button onClick={() => handleDeleteSchedule(s.id)} disabled={deleting === s.id} className="text-xs font-medium text-vc-text-muted hover:text-vc-danger transition-colors">
                          {deleting === s.id ? "..." : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-vc-text-muted">
                    Created {new Date(s.created_at).toLocaleDateString()} · {s.workflow_mode}
                    {s.status === "published" && s.published_at && (
                      <> · Published {new Date(s.published_at).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
