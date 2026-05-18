"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Ministry, Schedule, ApprovalStatus, Person } from "@/lib/types";

interface ApprovalCountdownProps {
  schedule: Schedule;
  ministries: Ministry[];
  /**
   * Active volunteers/people for the church — used to resolve
   * approval.approved_by (Firebase UID) to a human name via Person.user_id.
   * Codex Run 3 PR #27 retest (2026-05-17): the summary used to render the
   * raw UID; now it mirrors MinistryReviewPanel's name resolution.
   */
  volunteers?: Person[];
  /**
   * Church IANA timezone (e.g. "America/Chicago") so the "Approved {date}"
   * line shows the org's local date instead of the browser's UTC. Falls
   * back to UTC if not provided.
   */
  churchTimezone?: string;
  onRequestApproval?: () => void;
  loading?: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusBadgeVariant(status: ApprovalStatus): "success" | "danger" | "warning" {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "pending":
      return "warning";
  }
}

function statusLabel(status: ApprovalStatus): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "pending":
      return "Pending";
  }
}

export function ApprovalCountdown({
  schedule,
  ministries,
  volunteers,
  churchTimezone,
  onRequestApproval,
  loading,
}: ApprovalCountdownProps) {
  const targetDate = schedule.approval_workflow?.target_approval_date ?? null;

  // Codex Run 3 PR #27 retest (2026-05-17): resolve Firebase UID →
  // Person.name via the same map MinistryReviewPanel uses, so the summary
  // tiles read "Approved May 17, 2026 by Sarah Pastor Tester" instead of
  // "Approved May 18, 2026 by NQUd09eP1fOD3MWrdpIbHYUXm0z2".
  const personByUserId = useMemo(() => {
    const m = new Map<string, Person>();
    for (const v of volunteers ?? []) {
      if (v.user_id) m.set(v.user_id, v);
    }
    return m;
  }, [volunteers]);

  function resolveApproverName(uid: string | null | undefined): string {
    if (!uid) return "";
    return personByUserId.get(uid)?.name || uid;
  }

  function formatApprovedAt(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        timeZone: churchTimezone || "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return new Date(iso).toLocaleDateString();
    }
  }

  const daysRemaining = useMemo(() => {
    if (!targetDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDate + "T12:00:00");
    target.setHours(0, 0, 0, 0);
    const diff = target.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [targetDate]);

  const approvedCount = useMemo(() => {
    return ministries.filter(
      (m) => schedule.ministry_approvals[m.id]?.status === "approved",
    ).length;
  }, [ministries, schedule.ministry_approvals]);

  const allApproved = approvedCount === ministries.length && ministries.length > 0;
  const progressPercent =
    ministries.length > 0 ? Math.round((approvedCount / ministries.length) * 100) : 0;

  function getStatus(ministryId: string): ApprovalStatus {
    return schedule.ministry_approvals[ministryId]?.status ?? "pending";
  }

  function getApproval(ministryId: string) {
    return schedule.ministry_approvals[ministryId] ?? null;
  }

  return (
    <div className="space-y-6">
      {/* All-approved banner */}
      {allApproved && (
        <div className="flex items-center gap-3 rounded-xl border border-vc-sage/30 bg-vc-sage/10 px-5 py-4">
          <svg
            className="h-6 w-6 shrink-0 text-vc-sage"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          <div>
            <p className="font-semibold text-vc-sage-dark">All teams approved</p>
            <p className="text-sm text-vc-sage-dark/80">
              {approvedCount} of {ministries.length} ministries have signed off on this schedule.
            </p>
          </div>
        </div>
      )}

      {/* Countdown + progress section */}
      {!allApproved && (
        <div className="rounded-xl border border-vc-border-light bg-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Countdown */}
            {targetDate != null && daysRemaining != null && (
              <div>
                <p className="text-sm text-vc-text-secondary">Approval deadline</p>
                <p className="font-display text-2xl font-bold text-vc-indigo">
                  {daysRemaining > 0
                    ? `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining`
                    : daysRemaining === 0
                      ? "Due today"
                      : `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) !== 1 ? "s" : ""} overdue`}
                </p>
                <p className="mt-0.5 text-sm text-vc-text-muted">
                  Target: {formatDate(targetDate)}
                </p>
              </div>
            )}

            {/* Progress count */}
            <div className="text-right">
              <p className="text-sm text-vc-text-secondary">Teams approved</p>
              <p className="font-display text-2xl font-bold text-vc-indigo">
                {approvedCount}
                <span className="text-base font-normal text-vc-text-muted">
                  {" "}/ {ministries.length}
                </span>
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-vc-bg-warm">
              <div
                className="h-full rounded-full bg-vc-sage transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Ministry approval grid */}
      <div>
        <h3 className="font-display mb-3 text-lg font-semibold text-vc-indigo">
          Ministry Approvals
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {ministries.map((ministry) => {
            const status = getStatus(ministry.id);
            const approval = getApproval(ministry.id);

            return (
              <div
                key={ministry.id}
                className={`rounded-xl border bg-white p-4 ${
                  status === "approved"
                    ? "border-vc-sage/30"
                    : status === "rejected"
                      ? "border-vc-danger/30"
                      : "border-vc-border-light"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: ministry.color }}
                    />
                    <span className="font-semibold text-vc-indigo">
                      {ministry.name}
                    </span>
                  </div>
                  <Badge variant={statusBadgeVariant(status)}>
                    {statusLabel(status)}
                  </Badge>
                </div>

                {/* Approved details */}
                {status === "approved" && approval?.approved_at && (
                  <p
                    className="mt-2 text-xs text-vc-text-muted"
                    title={
                      approval.approved_by
                        ? `Approved by ${resolveApproverName(approval.approved_by)} on ${formatApprovedAt(approval.approved_at)}`
                        : undefined
                    }
                  >
                    Approved {formatApprovedAt(approval.approved_at)}
                    {approval.approved_by
                      ? ` by ${resolveApproverName(approval.approved_by)}`
                      : ""}
                  </p>
                )}

                {/* Rejected details */}
                {status === "rejected" && approval?.approved_at && (
                  <p className="mt-2 text-xs text-vc-text-muted">
                    Rejected {formatApprovedAt(approval.approved_at)}
                    {approval.approved_by
                      ? ` by ${resolveApproverName(approval.approved_by)}`
                      : ""}
                  </p>
                )}

                {/* Notes */}
                {approval?.notes && (
                  <p className="mt-2 text-xs italic text-vc-text-muted">
                    {approval.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Request Approval button */}
      {!allApproved && onRequestApproval && (
        <div className="pt-2">
          <Button
            onClick={onRequestApproval}
            loading={loading}
            className="min-h-[44px] min-w-[44px] w-full sm:w-auto"
          >
            Request Approval
          </Button>
        </div>
      )}
    </div>
  );
}
