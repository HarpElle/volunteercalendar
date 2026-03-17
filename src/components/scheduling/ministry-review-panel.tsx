"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type {
  Assignment,
  Ministry,
  Schedule,
  Service,
  Volunteer,
  ApprovalStatus,
} from "@/lib/types";

interface MinistryReviewPanelProps {
  schedule: Schedule;
  assignments: Assignment[];
  ministries: Ministry[];
  services: Service[];
  volunteers: Volunteer[];
  onApprove: (ministryId: string, notes?: string) => void;
  onReject: (ministryId: string, notes?: string) => void;
  loading?: boolean;
}

export function MinistryReviewPanel({
  schedule,
  assignments,
  ministries,
  services,
  volunteers,
  onApprove,
  onReject,
  loading,
}: MinistryReviewPanelProps) {
  const volunteerMap = useMemo(
    () => new Map(volunteers.map((v) => [v.id, v])),
    [volunteers],
  );
  const serviceMap = useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services],
  );

  // Group assignments by ministry
  const byMinistry = useMemo(() => {
    const groups: Record<string, Assignment[]> = {};
    for (const a of assignments) {
      if (!groups[a.ministry_id]) groups[a.ministry_id] = [];
      groups[a.ministry_id].push(a);
    }
    return groups;
  }, [assignments]);

  // Only show ministries that have assignments in this schedule
  const activeMinistries = ministries.filter((m) => byMinistry[m.id]?.length > 0);

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function getApprovalStatus(ministryId: string): ApprovalStatus | null {
    return schedule.ministry_approvals[ministryId]?.status ?? null;
  }

  const allApproved = activeMinistries.every(
    (m) => getApprovalStatus(m.id) === "approved"
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-vc-indigo">Ministry Review</h3>
        {allApproved && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-vc-sage/10 px-3 py-1 text-sm font-medium text-vc-sage">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            All ministries approved
          </span>
        )}
      </div>

      {activeMinistries.map((ministry) => {
        const ministryAssignments = byMinistry[ministry.id] || [];
        const status = getApprovalStatus(ministry.id);
        const approval = schedule.ministry_approvals[ministry.id];

        // Group by date for review
        const byDate: Record<string, Assignment[]> = {};
        for (const a of ministryAssignments) {
          if (!byDate[a.service_date]) byDate[a.service_date] = [];
          byDate[a.service_date].push(a);
        }
        const dates = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));

        return (
          <div
            key={ministry.id}
            className={`rounded-xl border bg-white overflow-hidden ${
              status === "approved"
                ? "border-vc-sage/30"
                : status === "rejected"
                ? "border-vc-danger/30"
                : "border-vc-border-light"
            }`}
          >
            {/* Ministry header */}
            <div className="flex items-center justify-between border-b border-vc-border-light px-5 py-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: ministry.color }}
                />
                <span className="font-semibold text-vc-indigo">{ministry.name}</span>
                <span className="text-xs text-vc-text-muted">
                  {ministryAssignments.length} assignment{ministryAssignments.length !== 1 ? "s" : ""}
                </span>
              </div>

              {status === "approved" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-vc-sage/10 px-2.5 py-1 text-xs font-medium text-vc-sage">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Approved{approval?.approved_at ? ` · ${new Date(approval.approved_at).toLocaleDateString()}` : ""}
                </span>
              ) : status === "rejected" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-vc-danger/10 px-2.5 py-1 text-xs font-medium text-vc-danger">
                  Rejected
                </span>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    loading={loading}
                    onClick={() => onReject(ministry.id)}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    loading={loading}
                    onClick={() => onApprove(ministry.id)}
                  >
                    Approve
                  </Button>
                </div>
              )}
            </div>

            {/* Assignment summary */}
            <div className="px-5 py-3 space-y-2">
              {dates.map(([date, dateAssigns]) => (
                <div key={date} className="flex flex-wrap items-start gap-2">
                  <span className="shrink-0 w-28 text-xs font-medium text-vc-text-muted pt-1">
                    {formatDate(date)}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {dateAssigns.map((a) => {
                      const vol = volunteerMap.get(a.volunteer_id);
                      const service = serviceMap.get(a.service_id);
                      return (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-vc-bg px-2.5 py-1 text-xs"
                        >
                          <span className="font-medium text-vc-indigo">{vol?.name || "?"}</span>
                          <span className="text-vc-text-muted">{a.role_title}</span>
                          {service && (
                            <span className="text-vc-text-muted">· {service.name}</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Notes */}
            {approval?.notes && (
              <div className="border-t border-vc-border-light px-5 py-2 text-xs text-vc-text-muted italic">
                Note: {approval.notes}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
