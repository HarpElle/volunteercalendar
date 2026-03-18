"use client";

import { useMemo, useState } from "react";
import type { Assignment, Service, Volunteer, Ministry, Schedule } from "@/lib/types";
import { getServiceMinistryIds } from "@/lib/utils/service-helpers";

interface ScheduleMatrixProps {
  assignments: Assignment[];
  services: Service[];
  volunteers: Volunteer[];
  ministries: Ministry[];
  schedule: Schedule;
  onReassign?: (assignmentId: string, newVolunteerId: string) => void;
  onUnassign?: (assignmentId: string) => void;
}

type ViewMode = "by-date" | "by-volunteer";

export function ScheduleMatrix({
  assignments,
  services,
  volunteers,
  ministries,
  schedule,
  onReassign,
  onUnassign,
}: ScheduleMatrixProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("by-date");
  const [filterMinistry, setFilterMinistry] = useState<string>("all");
  const [reassigning, setReassigning] = useState<string | null>(null);

  const isDraft = schedule.status === "draft";

  const serviceMap = useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services],
  );
  const volunteerMap = useMemo(
    () => new Map(volunteers.map((v) => [v.id, v])),
    [volunteers],
  );
  const ministryMap = useMemo(
    () => new Map(ministries.map((m) => [m.id, m])),
    [ministries],
  );

  const filteredAssignments = useMemo(() => {
    if (filterMinistry === "all") return assignments;
    return assignments.filter((a) => a.ministry_id === filterMinistry);
  }, [assignments, filterMinistry]);

  // Group assignments by date
  const byDate = useMemo(() => {
    const groups: Record<string, Assignment[]> = {};
    for (const a of filteredAssignments) {
      if (!groups[a.service_date]) groups[a.service_date] = [];
      groups[a.service_date].push(a);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredAssignments]);

  // Group assignments by volunteer
  const byVolunteer = useMemo(() => {
    const groups: Record<string, Assignment[]> = {};
    for (const a of filteredAssignments) {
      if (!groups[a.volunteer_id]) groups[a.volunteer_id] = [];
      groups[a.volunteer_id].push(a);
    }
    return Object.entries(groups)
      .map(([volId, assigns]) => ({
        volunteer: volunteerMap.get(volId),
        assignments: assigns.sort((a, b) => a.service_date.localeCompare(b.service_date)),
      }))
      .filter((g) => g.volunteer)
      .sort((a, b) => (a.volunteer!.name).localeCompare(b.volunteer!.name));
  }, [filteredAssignments, volunteerMap]);

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function getMinistryColor(ministryId: string): string {
    return ministryMap.get(ministryId)?.color || "#9A9BB5";
  }

  function handleReassign(assignmentId: string, newVolunteerId: string) {
    onReassign?.(assignmentId, newVolunteerId);
    setReassigning(null);
  }

  if (assignments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
        <p className="text-vc-text-secondary">No assignments in this schedule.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-vc-border bg-white p-0.5">
          <button
            onClick={() => setViewMode("by-date")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "by-date"
                ? "bg-vc-indigo text-white"
                : "text-vc-text-secondary hover:text-vc-indigo"
            }`}
          >
            By Date
          </button>
          <button
            onClick={() => setViewMode("by-volunteer")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "by-volunteer"
                ? "bg-vc-indigo text-white"
                : "text-vc-text-secondary hover:text-vc-indigo"
            }`}
          >
            By Volunteer
          </button>
        </div>

        <select
          value={filterMinistry}
          onChange={(e) => setFilterMinistry(e.target.value)}
          className="rounded-lg border border-vc-border bg-white px-3 py-1.5 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
        >
          <option value="all">All Ministries</option>
          {ministries.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>

        <span className="text-xs text-vc-text-muted">
          {filteredAssignments.length} assignment{filteredAssignments.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* By Date View */}
      {viewMode === "by-date" && (
        <div className="space-y-4">
          {byDate.map(([date, dateAssignments]) => {
            const byService: Record<string, Assignment[]> = {};
            for (const a of dateAssignments) {
              const svcId = a.service_id || "";
              if (!byService[svcId]) byService[svcId] = [];
              byService[svcId].push(a);
            }

            return (
              <div key={date} className="rounded-xl border border-vc-border-light bg-white overflow-hidden">
                <div className="border-b border-vc-border-light bg-vc-bg-warm px-5 py-3">
                  <h3 className="font-semibold text-vc-indigo">{formatDate(date)}</h3>
                </div>
                <div className="divide-y divide-vc-border-light">
                  {Object.entries(byService).map(([serviceId, svcAssignments]) => {
                    const service = serviceMap.get(serviceId);
                    if (!service) return null;
                    const ministryIds = getServiceMinistryIds(service);
                    const primaryMinistry = ministryMap.get(ministryIds[0]);
                    const ministryNames = ministryIds
                      .map((id) => ministryMap.get(id)?.name)
                      .filter(Boolean)
                      .join(", ");

                    return (
                      <div key={serviceId} className="px-5 py-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: primaryMinistry?.color || "#ccc" }}
                          />
                          <span className="text-sm font-medium text-vc-indigo">
                            {service.name}
                          </span>
                          <span className="text-xs text-vc-text-muted">
                            {service.start_time} · {ministryNames}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {svcAssignments.map((a) => {
                            const vol = volunteerMap.get(a.volunteer_id);
                            const isReassigningThis = reassigning === a.id;

                            if (isReassigningThis) {
                              return (
                                <div key={a.id} className="inline-flex items-center gap-1 rounded-lg border border-vc-coral bg-vc-coral/5 px-2 py-1">
                                  <select
                                    autoFocus
                                    className="bg-transparent text-sm text-vc-indigo focus:outline-none"
                                    defaultValue=""
                                    onChange={(e) => {
                                      if (e.target.value) handleReassign(a.id, e.target.value);
                                    }}
                                    onBlur={() => setReassigning(null)}
                                  >
                                    <option value="" disabled>Pick volunteer...</option>
                                    {volunteers
                                      .filter((v) => v.id !== a.volunteer_id)
                                      .sort((x, y) => x.name.localeCompare(y.name))
                                      .map((v) => (
                                        <option key={v.id} value={v.id}>{v.name}</option>
                                      ))}
                                  </select>
                                  <button
                                    onClick={() => setReassigning(null)}
                                    className="text-vc-text-muted hover:text-vc-danger"
                                  >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={a.id}
                                className="group/chip inline-flex items-center gap-1.5 rounded-lg border border-vc-border-light bg-vc-bg px-3 py-1.5 text-sm"
                              >
                                <span className="font-medium text-vc-indigo">
                                  {vol?.name || "Unknown"}
                                </span>
                                <span className="text-xs text-vc-text-muted">
                                  {a.role_title}
                                </span>
                                <StatusDot status={a.status} />
                                {isDraft && onReassign && (
                                  <button
                                    onClick={() => setReassigning(a.id)}
                                    className="ml-1 hidden text-vc-text-muted hover:text-vc-coral group-hover/chip:inline-flex"
                                    title="Reassign"
                                  >
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                                    </svg>
                                  </button>
                                )}
                                {isDraft && onUnassign && (
                                  <button
                                    onClick={() => onUnassign(a.id)}
                                    className="hidden text-vc-text-muted hover:text-vc-danger group-hover/chip:inline-flex"
                                    title="Remove"
                                  >
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {/* Unfilled roles */}
                          {service.roles.map((role) => {
                            const filled = svcAssignments.filter((a) => a.role_id === role.role_id).length;
                            const gap = role.count - filled;
                            return gap > 0 ? (
                              <div
                                key={role.role_id}
                                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-vc-danger/30 bg-vc-danger/5 px-3 py-1.5 text-sm text-vc-danger"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                                </svg>
                                {gap}× {role.title} needed
                              </div>
                            ) : null;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* By Volunteer View */}
      {viewMode === "by-volunteer" && (
        <div className="rounded-xl border border-vc-border-light bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-vc-border-light bg-vc-bg-warm">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Volunteer</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Assignments</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted text-right">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vc-border-light">
                {byVolunteer.map(({ volunteer, assignments: volAssignments }) => (
                  <tr key={volunteer!.id} className="hover:bg-vc-bg-warm/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-vc-indigo whitespace-nowrap">{volunteer!.name}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {volAssignments.map((a) => (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: getMinistryColor(a.ministry_id) + "15",
                              color: getMinistryColor(a.ministry_id),
                            }}
                          >
                            {formatDate(a.service_date).split(",")[0]} · {a.role_title}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        volAssignments.length > 6
                          ? "bg-vc-danger/10 text-vc-danger"
                          : volAssignments.length > 3
                          ? "bg-vc-sand/30 text-vc-sand-dark"
                          : "bg-vc-sage/10 text-vc-sage"
                      }`}>
                        {volAssignments.length}
                      </span>
                    </td>
                  </tr>
                ))}
                {volunteers
                  .filter((v) => !byVolunteer.some((bv) => bv.volunteer?.id === v.id))
                  .filter((v) => filterMinistry === "all" || v.ministry_ids.includes(filterMinistry))
                  .map((v) => (
                    <tr key={v.id} className="opacity-50">
                      <td className="px-5 py-3 font-medium text-vc-text-muted whitespace-nowrap">{v.name}</td>
                      <td className="px-5 py-3 text-xs text-vc-text-muted italic">Not scheduled</td>
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex rounded-full bg-vc-bg-warm px-2.5 py-0.5 text-xs font-semibold text-vc-text-muted">0</span>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-vc-text-muted",
    confirmed: "bg-vc-sage",
    declined: "bg-vc-danger",
    no_show: "bg-vc-sand-dark",
    substitute_requested: "bg-vc-sand",
  };

  return (
    <span
      className={`h-2 w-2 rounded-full ${colors[status] || "bg-vc-text-muted"}`}
      title={status}
    />
  );
}
