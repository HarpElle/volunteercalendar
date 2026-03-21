"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { getOrgTerms } from "@/lib/utils/org-terms";
import { ORG_WIDE_MINISTRY_ID } from "@/lib/types";
import type {
  Volunteer,
  Ministry,
  OnboardingStep,
  OnboardingStepType,
  VolunteerJourneyStep,
  JourneyStepStatus,
  OrgType,
} from "@/lib/types";

// --- Type icon helpers ---

function StepTypeIcon({ type }: { type: OnboardingStepType }) {
  const cls = "h-5 w-5 shrink-0";
  switch (type) {
    case "class":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
        </svg>
      );
    case "background_check":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
        </svg>
      );
    case "minimum_service":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      );
    case "ministry_tenure":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      );
    case "shadow":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      );
    default:
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
        </svg>
      );
  }
}

const STATUS_CONFIG: Record<JourneyStepStatus, { label: string; variant: "default" | "warning" | "success" }> = {
  pending: { label: "Not Started", variant: "default" },
  in_progress: { label: "In Progress", variant: "warning" },
  completed: { label: "Complete", variant: "success" },
  waived: { label: "Waived", variant: "success" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// --- Main page ---

export default function MyJourneyPage() {
  const { user, activeMembership, memberships } = useAuth();
  const churchId = activeMembership?.church_id;

  const [loading, setLoading] = useState(true);
  const [churchName, setChurchName] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("church");
  const [orgPrereqs, setOrgPrereqs] = useState<OnboardingStep[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [volunteer, setVolunteer] = useState<Volunteer | null>(null);

  useEffect(() => {
    if (!churchId || !user) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const [churchSnap, minDocs, volDocs] = await Promise.all([
          getDoc(doc(db, "churches", churchId!)),
          getChurchDocuments(churchId!, "ministries"),
          getChurchDocuments(churchId!, "volunteers"),
        ]);

        if (churchSnap.exists()) {
          const data = churchSnap.data();
          setChurchName(data.name || "");
          setOrgType((data.org_type as OrgType) || "church");
          setOrgPrereqs((data.org_prerequisites as OnboardingStep[]) || []);
        }

        setMinistries(minDocs as unknown as Ministry[]);

        // Find the current user's volunteer record
        const vols = volDocs as unknown as Volunteer[];
        const activeMemIds = memberships.filter((m) => m.status === "active").map((m) => m.id);
        const myVol =
          vols.find((v) => v.user_id === user!.uid) ||
          vols.find((v) => v.membership_id && activeMemIds.includes(v.membership_id)) ||
          null;
        setVolunteer(myVol);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId, user, memberships]);

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner />
      </div>
    );
  }

  const terms = getOrgTerms(orgType);
  const journey = volunteer?.volunteer_journey || [];

  // Build prerequisite groups: org-wide + per-ministry
  const groups: { label: string; color?: string; steps: { step: OnboardingStep; journeyStep?: VolunteerJourneyStep }[] }[] = [];

  // Org-wide prerequisites
  if (orgPrereqs.length > 0) {
    groups.push({
      label: "Organization-Wide",
      steps: orgPrereqs.map((step) => ({
        step,
        journeyStep: journey.find((j) => j.step_id === step.id && j.ministry_id === ORG_WIDE_MINISTRY_ID),
      })),
    });
  }

  // Ministry-specific prerequisites
  const myMinistryIds = volunteer?.ministry_ids || [];
  for (const mid of myMinistryIds) {
    const ministry = ministries.find((m) => m.id === mid);
    if (!ministry || !ministry.prerequisites || ministry.prerequisites.length === 0) continue;
    groups.push({
      label: ministry.name,
      color: ministry.color,
      steps: ministry.prerequisites.map((step) => ({
        step,
        journeyStep: journey.find((j) => j.step_id === step.id && j.ministry_id === mid),
      })),
    });
  }

  // Count progress
  const totalSteps = groups.reduce((sum, g) => sum + g.steps.length, 0);
  const completedSteps = groups.reduce(
    (sum, g) => sum + g.steps.filter((s) => s.journeyStep?.status === "completed" || s.journeyStep?.status === "waived").length,
    0,
  );
  const allComplete = totalSteps > 0 && completedSteps === totalSteps;

  // Background check info
  const bgCheck = volunteer?.background_check;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Welcome header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl text-vc-indigo sm:text-3xl">
          {churchName
            ? `Thank you for volunteering your time and talents to ${churchName}!`
            : "Your Volunteer Journey"}
        </h1>
        {totalSteps > 0 && !allComplete && (
          <p className="mt-2 text-vc-text-secondary">
            Here&apos;s your journey toward being fully equipped to serve. Your {terms.singularLower} leaders are here to support you every step of the way.
          </p>
        )}
      </div>

      {/* All-clear state */}
      {(totalSteps === 0 || allComplete) && (
        <div className="mb-8 rounded-xl border border-vc-sage/30 bg-vc-sage/5 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-vc-sage/20">
            <svg className="h-6 w-6 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="font-display text-xl text-vc-indigo">
            {allComplete ? "You\u2019re all set!" : "No prerequisites needed"}
          </h2>
          <p className="mt-1 text-sm text-vc-text-secondary">
            {allComplete
              ? "All your prerequisites are complete. You\u2019re ready to serve!"
              : "There are no prerequisites to complete right now. You\u2019re ready to jump in!"}
          </p>
        </div>
      )}

      {/* Progress bar */}
      {totalSteps > 0 && !allComplete && (
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-vc-text-secondary">
              {completedSteps} of {totalSteps} step{totalSteps !== 1 ? "s" : ""} complete
            </span>
            <span className="text-sm font-semibold text-vc-indigo">
              {Math.round((completedSteps / totalSteps) * 100)}%
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-vc-border overflow-hidden">
            <div
              className="h-full rounded-full bg-vc-sage transition-all"
              style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Step groups */}
      {groups.map((group) => (
        <section key={group.label} className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            {group.color && (
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
            )}
            <h2 className="text-sm font-semibold uppercase tracking-wider text-vc-text-muted">
              {group.label}
            </h2>
          </div>
          <div className="space-y-2">
            {group.steps.map(({ step, journeyStep }) => {
              const status: JourneyStepStatus = journeyStep?.status || "pending";
              const config = STATUS_CONFIG[status];
              const isComplete = status === "completed" || status === "waived";

              return (
                <div
                  key={step.id}
                  className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${
                    isComplete
                      ? "border-vc-sage/30 bg-vc-sage/5"
                      : status === "in_progress"
                        ? "border-vc-sand/40 bg-vc-sand/5"
                        : "border-vc-border-light bg-white"
                  }`}
                >
                  <div className={`mt-0.5 ${isComplete ? "text-vc-sage" : status === "in_progress" ? "text-vc-sand" : "text-vc-text-muted"}`}>
                    <StepTypeIcon type={step.type} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium ${isComplete ? "text-vc-sage line-through" : "text-vc-indigo"}`}>
                        {step.label}
                      </p>
                      <Badge variant={config.variant}>{config.label}</Badge>
                    </div>
                    {journeyStep?.completed_at && (
                      <p className="mt-0.5 text-xs text-vc-text-muted">
                        Completed {formatDate(journeyStep.completed_at)}
                      </p>
                    )}
                    {journeyStep?.notes && (
                      <p className="mt-0.5 text-xs text-vc-text-muted italic">{journeyStep.notes}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Background check card */}
      {bgCheck && bgCheck.status !== "not_required" && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-vc-text-muted">
            Background Check
          </h2>
          <div className={`flex items-start gap-3 rounded-xl border p-4 ${
            bgCheck.status === "cleared"
              ? "border-vc-sage/30 bg-vc-sage/5"
              : bgCheck.status === "expired"
                ? "border-vc-danger/20 bg-vc-danger/5"
                : "border-vc-sand/40 bg-vc-sand/5"
          }`}>
            <div className={`mt-0.5 ${
              bgCheck.status === "cleared" ? "text-vc-sage" : bgCheck.status === "expired" ? "text-vc-danger" : "text-vc-sand"
            }`}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-vc-indigo">Background Check</p>
                <Badge variant={bgCheck.status === "cleared" ? "success" : bgCheck.status === "expired" ? "danger" : "warning"}>
                  {bgCheck.status === "cleared" ? "Cleared" : bgCheck.status === "expired" ? "Expired" : "Pending"}
                </Badge>
              </div>
              {bgCheck.expires_at && (
                <p className="mt-0.5 text-xs text-vc-text-muted">
                  {bgCheck.status === "expired" ? "Expired" : "Expires"} {formatDate(bgCheck.expires_at)}
                </p>
              )}
              {bgCheck.provider && (
                <p className="mt-0.5 text-xs text-vc-text-muted">Provider: {bgCheck.provider}</p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
