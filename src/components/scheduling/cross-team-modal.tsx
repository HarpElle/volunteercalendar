"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/context/auth-context";
import type { Ministry } from "@/lib/types";

// --- API response types ---

interface CoordinationAssignment {
  ministry_id: string;
  role_title: string;
  service_date: string;
  service_id: string;
}

interface SharedVolunteer {
  volunteer_id: string;
  volunteer_name: string;
  assignments: CoordinationAssignment[];
}

interface DateConflict {
  volunteer_id: string;
  volunteer_name: string;
  date: string;
  ministries: string[];
}

interface CoordinationData {
  shared_volunteers: SharedVolunteer[];
  date_conflicts: DateConflict[];
  total_shared: number;
  total_date_conflicts: number;
}

// --- Props ---

interface CrossTeamModalProps {
  open: boolean;
  onClose: () => void;
  scheduleId: string;
  churchId: string;
  ministries: Ministry[];
}

// --- Helpers ---

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function resolveMinistry(
  ministryId: string,
  ministries: Ministry[],
): { name: string; color: string } {
  const match = ministries.find((m) => m.id === ministryId);
  return {
    name: match?.name ?? "Unknown Ministry",
    color: match?.color ?? "#94a3b8",
  };
}

// --- Component ---

export function CrossTeamModal({
  open,
  onClose,
  scheduleId,
  churchId,
  ministries,
}: CrossTeamModalProps) {
  const { user } = useAuth();
  const [data, setData] = useState<CoordinationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"shared" | "conflicts">("shared");

  const fetchCoordination = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/schedules/${scheduleId}/coordination?church_id=${encodeURIComponent(churchId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        throw new Error(`Failed to load coordination data (${res.status})`);
      }
      const json: CoordinationData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [user, scheduleId, churchId]);

  useEffect(() => {
    if (open) {
      fetchCoordination();
    } else {
      setData(null);
      setError(null);
      setTab("shared");
    }
  }, [open, fetchCoordination]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cross-Team Coordination"
      subtitle="Volunteers shared across ministries for this schedule"
      maxWidth="max-w-3xl"
    >
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Spinner size="lg" />
          <p className="mt-3 text-sm text-vc-text-muted">
            Loading coordination data...
          </p>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center gap-3 py-12">
          <p className="text-sm text-vc-danger">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchCoordination}>
            Try Again
          </Button>
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-5">
          {/* Tab bar */}
          <div className="flex gap-1 rounded-lg bg-vc-bg-warm p-1">
            <button
              onClick={() => setTab("shared")}
              className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                tab === "shared"
                  ? "bg-white text-vc-indigo shadow-sm"
                  : "text-vc-text-secondary hover:text-vc-indigo"
              }`}
            >
              Shared Volunteers
              {data.total_shared > 0 && (
                <Badge variant="primary">{data.total_shared}</Badge>
              )}
            </button>
            <button
              onClick={() => setTab("conflicts")}
              className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                tab === "conflicts"
                  ? "bg-white text-vc-indigo shadow-sm"
                  : "text-vc-text-secondary hover:text-vc-indigo"
              }`}
            >
              Date Conflicts
              {data.total_date_conflicts > 0 && (
                <Badge variant="warning">{data.total_date_conflicts}</Badge>
              )}
            </button>
          </div>

          {/* Shared volunteers tab */}
          {tab === "shared" && (
            <div>
              {data.shared_volunteers.length === 0 ? (
                <EmptyState message="No volunteers are shared across ministries for this schedule." />
              ) : (
                <ul className="space-y-3">
                  {data.shared_volunteers.map((vol) => (
                    <SharedVolunteerCard
                      key={vol.volunteer_id}
                      volunteer={vol}
                      ministries={ministries}
                      dateConflicts={data.date_conflicts}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Date conflicts tab */}
          {tab === "conflicts" && (
            <div>
              {data.date_conflicts.length === 0 ? (
                <EmptyState message="No same-date conflicts found. All shared volunteers are scheduled on different dates." />
              ) : (
                <ul className="space-y-3">
                  {data.date_conflicts.map((conflict) => (
                    <DateConflictCard
                      key={`${conflict.volunteer_id}-${conflict.date}`}
                      conflict={conflict}
                      ministries={ministries}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {!loading && (
        <div className="mt-6 flex justify-end border-t border-vc-border-light pt-4">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </Modal>
  );
}

// --- Sub-components ---

function SharedVolunteerCard({
  volunteer,
  ministries,
  dateConflicts,
}: {
  volunteer: SharedVolunteer;
  ministries: Ministry[];
  dateConflicts: DateConflict[];
}) {
  const hasConflict = dateConflicts.some(
    (c) => c.volunteer_id === volunteer.volunteer_id,
  );

  // Group assignments by ministry for clean display
  const byMinistry = new Map<string, CoordinationAssignment[]>();
  for (const a of volunteer.assignments) {
    const existing = byMinistry.get(a.ministry_id) ?? [];
    existing.push(a);
    byMinistry.set(a.ministry_id, existing);
  }

  return (
    <li className="rounded-xl border border-vc-border-light bg-vc-bg-warm/40 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-vc-indigo">
          {volunteer.volunteer_name}
        </p>
        <Badge variant="primary">
          {byMinistry.size} {byMinistry.size === 1 ? "ministry" : "ministries"}
        </Badge>
        {hasConflict && <Badge variant="warning">Date conflict</Badge>}
      </div>

      <div className="space-y-2">
        {Array.from(byMinistry.entries()).map(([ministryId, assignments]) => {
          const ministry = resolveMinistry(ministryId, ministries);
          return (
            <div key={ministryId} className="flex items-start gap-2.5">
              <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: ministry.color }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-vc-text">
                  {ministry.name}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {assignments.map((a) => (
                    <span
                      key={`${a.service_id}-${a.role_title}`}
                      className="text-xs text-vc-text-secondary"
                    >
                      {a.role_title} -- {formatDate(a.service_date)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </li>
  );
}

function DateConflictCard({
  conflict,
  ministries,
}: {
  conflict: DateConflict;
  ministries: Ministry[];
}) {
  return (
    <li className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-amber-900">
          {conflict.volunteer_name}
        </p>
        <span className="text-xs font-medium text-amber-700">
          {formatDate(conflict.date)}
        </span>
      </div>
      <p className="mb-2 text-xs text-amber-700">
        Assigned to {conflict.ministries.length} ministries on the same date:
      </p>
      <div className="flex flex-wrap gap-2">
        {conflict.ministries.map((ministryId) => {
          const ministry = resolveMinistry(ministryId, ministries);
          return (
            <span
              key={ministryId}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/60 bg-white/80 px-2.5 py-1 text-xs font-medium text-amber-900"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: ministry.color }}
                aria-hidden="true"
              />
              {ministry.name}
            </span>
          );
        })}
      </div>
    </li>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <svg
        className="mb-3 h-10 w-10 text-vc-text-muted"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
        />
      </svg>
      <p className="max-w-xs text-sm text-vc-text-muted">{message}</p>
    </div>
  );
}
