"use client";

import { useMemo, useState, type DragEvent } from "react";
import type { Assignment, Service, Person, Ministry, Schedule } from "@/lib/types";
import { getServiceMinistryIds } from "@/lib/utils/service-helpers";

interface ScheduleMatrixProps {
  assignments: Assignment[];
  services: Service[];
  volunteers: Person[];
  ministries: Ministry[];
  schedule: Schedule;
  onReassign?: (assignmentId: string, newVolunteerId: string) => void;
  onUnassign?: (assignmentId: string) => void;
}

type ViewMode = "by-date" | "by-volunteer" | "compare";

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
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const isDraft = schedule.status === "draft";

  // Drag-and-drop handlers for reassigning volunteers between slots
  function handleDragStart(e: DragEvent, assignment: Assignment) {
    e.dataTransfer.setData("text/plain", JSON.stringify({
      assignmentId: assignment.id,
      volunteerId: assignment.volunteer_id,
      roleId: assignment.role_id,
    }));
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: DragEvent, targetKey: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTarget(targetKey);
  }

  function handleDragLeave() {
    setDragOverTarget(null);
  }

  function handleDrop(e: DragEvent, targetAssignment: Assignment) {
    e.preventDefault();
    setDragOverTarget(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (!data.assignmentId || !data.volunteerId) return;
      // Swap: reassign the dragged assignment to take the target's volunteer,
      // and the target assignment to take the dragged volunteer
      if (data.assignmentId !== targetAssignment.id) {
        onReassign?.(data.assignmentId, targetAssignment.volunteer_id);
        onReassign?.(targetAssignment.id, data.volunteerId);
      }
    } catch {
      // Invalid drag data
    }
  }

  function handleDropOnEmpty(e: DragEvent, _roleId: string) {
    e.preventDefault();
    setDragOverTarget(null);
    // For empty slots, we could allow dropping a volunteer from another slot
    // but this requires more complex logic — for now just clear the drag state
  }

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
      const key = a.person_id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
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

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /**
   * Check if a volunteer is unavailable on a given date.
   * Returns a reason string if unavailable, or null if available.
   */
  function getUnavailableReason(vol: Person, dateStr: string): string | null {
    const sp = vol.scheduling_profile;
    if (!sp) return null;

    // Blockout date match
    if (sp.blockout_dates?.includes(dateStr)) {
      return "Blocked out";
    }

    // Recurring unavailable day match (e.g. "Sunday")
    if (sp.recurring_unavailable?.length) {
      const d = new Date(dateStr + "T12:00:00");
      const dayName = d.toLocaleDateString("en-US", { weekday: "long" });
      if (sp.recurring_unavailable.includes(dayName)) {
        return `Unavailable ${dayName}s`;
      }
    }

    // Max roles per month check
    const maxRoles = sp.max_roles_per_month ?? 4;
    if (maxRoles > 0) {
      const monthPrefix = dateStr.slice(0, 7); // "YYYY-MM"
      const monthCount = assignments.filter(
        (a) =>
          a.volunteer_id === vol.id &&
          a.service_date.startsWith(monthPrefix),
      ).length;
      if (monthCount >= maxRoles) {
        return `At limit (${maxRoles}/mo)`;
      }
    }

    return null;
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
          <button
            onClick={() => setViewMode("compare")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "compare"
                ? "bg-vc-indigo text-white"
                : "text-vc-text-secondary hover:text-vc-indigo"
            }`}
          >
            Compare
          </button>
        </div>

        <select
          value={filterMinistry}
          onChange={(e) => setFilterMinistry(e.target.value)}
          className="rounded-lg border border-vc-border bg-white px-3 py-1.5 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
        >
          <option value="all">All Ministries</option>
          {[...ministries].sort((a, b) => a.name.localeCompare(b.name)).map((m) => (
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

                    // Sub-group assignments by ministry within this service
                    const byMinistry: Record<string, Assignment[]> = {};
                    for (const a of svcAssignments) {
                      const mId = a.ministry_id || "_none";
                      if (!byMinistry[mId]) byMinistry[mId] = [];
                      byMinistry[mId].push(a);
                    }
                    const ministryGroups = Object.entries(byMinistry);

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
                        {ministryGroups.map(([mId, mAssignments]) => {
                          const ministry = ministryMap.get(mId);
                          const groupKey = `${date}_${serviceId}_${mId}`;
                          const isCollapsed = collapsedGroups.has(groupKey);
                          const showGroupHeader = ministryGroups.length > 1;

                          return (
                            <div key={mId} className="mb-2 last:mb-0">
                              {showGroupHeader && (
                                <button
                                  onClick={() => toggleGroup(groupKey)}
                                  className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-vc-text-secondary hover:text-vc-indigo transition-colors"
                                >
                                  <svg
                                    className={`h-3 w-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                                  </svg>
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: ministry?.color || "#ccc" }}
                                  />
                                  {ministry?.name || "General"}
                                  <span className="text-vc-text-muted font-normal">
                                    ({mAssignments.length})
                                  </span>
                                </button>
                              )}
                              {!isCollapsed && (
                        <div className="flex flex-wrap gap-2">
                          {mAssignments.map((a) => {
                            const vol = volunteerMap.get(a.person_id);
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
                                      .sort((x, y) => {
                                        // Available volunteers first, then unavailable
                                        const xUnavail = getUnavailableReason(x, a.service_date);
                                        const yUnavail = getUnavailableReason(y, a.service_date);
                                        if (xUnavail && !yUnavail) return 1;
                                        if (!xUnavail && yUnavail) return -1;
                                        return x.name.localeCompare(y.name);
                                      })
                                      .map((v) => {
                                        const reason = getUnavailableReason(v, a.service_date);
                                        return (
                                          <option
                                            key={v.id}
                                            value={v.id}
                                            disabled={!!reason}
                                            className={reason ? "text-gray-400" : ""}
                                          >
                                            {v.name}{reason ? ` — ${reason}` : ""}
                                          </option>
                                        );
                                      })}
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
                                draggable={isDraft && !!onReassign}
                                onDragStart={isDraft && onReassign ? (e) => handleDragStart(e, a) : undefined}
                                onDragOver={isDraft && onReassign ? (e) => handleDragOver(e, a.id) : undefined}
                                onDragLeave={isDraft && onReassign ? handleDragLeave : undefined}
                                onDrop={isDraft && onReassign ? (e) => handleDrop(e, a) : undefined}
                                className={`group/chip inline-flex items-center gap-1.5 rounded-lg border bg-vc-bg px-3 py-1.5 text-sm transition-all ${
                                  isDraft && onReassign ? "cursor-grab active:cursor-grabbing" : ""
                                } ${
                                  dragOverTarget === a.id
                                    ? "border-vc-coral ring-2 ring-vc-coral/20 scale-105"
                                    : "border-vc-border-light"
                                }`}
                              >
                                <span className="font-medium text-vc-indigo">
                                  {vol?.name || "Unknown"}
                                  {a.assignment_type === "trainee" && (
                                    <span className="ml-1 text-[9px] font-medium text-vc-sand">(shadow)</span>
                                  )}
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
                        </div>
                              )}
                            </div>
                          );
                        })}
                        {/* Unfilled roles (service-level) */}
                        <div className="mt-1 flex flex-wrap gap-2">
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

      {/* Compare View — services as columns, volunteers as rows */}
      {viewMode === "compare" && (
        <CompareView
          assignments={filteredAssignments}
          services={services}
          volunteers={volunteers}
          ministries={ministries}
          schedule={schedule}
          getUnavailableReason={getUnavailableReason}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compare View — multi-service side-by-side with availability
// ---------------------------------------------------------------------------

function CompareView({
  assignments,
  services,
  volunteers,
  ministries,
  schedule,
  getUnavailableReason,
}: {
  assignments: Assignment[];
  services: Service[];
  volunteers: Person[];
  ministries: Ministry[];
  schedule: Schedule;
  getUnavailableReason: (vol: Person, dateStr: string) => string | null;
}) {
  // Get unique dates in the schedule
  const dates = useMemo(() => {
    const dateSet = new Set<string>();
    for (const a of assignments) dateSet.add(a.service_date);
    return [...dateSet].sort();
  }, [assignments]);

  const [selectedDate, setSelectedDate] = useState(dates[0] || "");

  // Services that have assignments on the selected date
  const dateServices = useMemo(() => {
    const svcIds = new Set<string>();
    for (const a of assignments) {
      if (a.service_date === selectedDate && a.service_id) {
        svcIds.add(a.service_id);
      }
    }
    return services.filter((s) => svcIds.has(s.id));
  }, [assignments, services, selectedDate]);

  const serviceMap = useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services],
  );
  const ministryMap = useMemo(
    () => new Map(ministries.map((m) => [m.id, m])),
    [ministries],
  );

  // Build assignment lookup: volId_svcId → Assignment[]
  const assignmentLookup = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      if (a.service_date !== selectedDate) continue;
      const key = `${a.volunteer_id}_${a.service_id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [assignments, selectedDate]);

  // Relevant volunteers: those assigned on this date or in relevant ministries
  const relevantVolunteers = useMemo(() => {
    const assignedIds = new Set<string>();
    for (const a of assignments) {
      if (a.service_date === selectedDate) assignedIds.add(a.volunteer_id);
    }
    return volunteers
      .filter((v) => assignedIds.has(v.id) || v.ministry_ids.some((mId) =>
        dateServices.some((s) => {
          const svcMinistryIds = s.ministries?.map((m) => m.ministry_id) || [s.ministry_id];
          return svcMinistryIds.includes(mId);
        }),
      ))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [volunteers, assignments, selectedDate, dateServices]);

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  if (dates.length === 0) {
    return <p className="py-8 text-center text-vc-text-muted">No dates to compare.</p>;
  }

  return (
    <div>
      {/* Date selector */}
      {dates.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {dates.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors min-h-[44px] ${
                selectedDate === d
                  ? "bg-vc-indigo text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {formatDate(d)}
            </button>
          ))}
        </div>
      )}

      {/* Compare table */}
      <div className="rounded-xl border border-vc-border-light bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-vc-border-light bg-vc-bg-warm">
                <th className="sticky left-0 z-10 bg-vc-bg-warm px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted min-w-[160px]">
                  Volunteer
                </th>
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted text-center min-w-[60px]">
                  Avail
                </th>
                {dateServices.map((svc) => (
                  <th
                    key={svc.id}
                    className="px-4 py-3 text-xs font-semibold text-vc-indigo text-center min-w-[140px]"
                  >
                    <div>{svc.name}</div>
                    <div className="font-normal text-vc-text-muted">{svc.start_time}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-vc-border-light">
              {relevantVolunteers.map((vol) => {
                const unavailReason = getUnavailableReason(vol, selectedDate);
                return (
                  <tr
                    key={vol.id}
                    className={`transition-colors ${unavailReason ? "opacity-50" : "hover:bg-vc-bg-warm/50"}`}
                  >
                    <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium text-vc-indigo whitespace-nowrap">
                      {vol.name}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {unavailReason ? (
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-vc-danger/10 text-vc-danger"
                          title={unavailReason}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </span>
                      ) : (
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-vc-sage/10 text-vc-sage"
                          title="Available"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        </span>
                      )}
                    </td>
                    {dateServices.map((svc) => {
                      const key = `${vol.id}_${svc.id}`;
                      const volAssignments = assignmentLookup.get(key) || [];
                      return (
                        <td key={svc.id} className="px-4 py-2.5 text-center">
                          {volAssignments.length > 0 ? (
                            <div className="flex flex-wrap justify-center gap-1">
                              {volAssignments.map((a) => (
                                <span
                                  key={a.id}
                                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
                                    a.assignment_type === "trainee"
                                      ? "bg-vc-sand/15 text-vc-sand border border-dashed border-vc-sand/40"
                                      : "bg-vc-sage/15 text-vc-sage"
                                  }`}
                                >
                                  {a.role_title}
                                  {a.assignment_type === "trainee" && <span className="text-[9px]">(shadow)</span>}
                                  <StatusDot status={a.status} />
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-vc-text-muted">--</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-vc-text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-vc-sage/10 text-vc-sage">
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </span>
          Available
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-vc-danger/10 text-vc-danger">
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </span>
          Unavailable
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block rounded bg-vc-sage/15 px-1.5 py-0.5 text-[10px] font-medium text-vc-sage">Role</span>
          Assigned
        </span>
      </div>
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
