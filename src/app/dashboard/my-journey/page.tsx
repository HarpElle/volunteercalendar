"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
  VolunteerJourneyStep,
  JourneyStepStatus,
  OrgType,
} from "@/lib/types";
import { StepTypeIcon } from "@/components/ui/step-type-icon";

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
      {/* Breadcrumb */}
      <nav className="mb-2 flex items-center gap-1.5 text-sm">
        <Link
          href="/dashboard/account"
          className="text-vc-text-muted transition-colors hover:text-vc-indigo"
        >
          Account Settings
        </Link>
        <span className="text-vc-text-muted/50">/</span>
        <span className="font-medium text-vc-text-secondary">My Journey</span>
      </nav>

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
