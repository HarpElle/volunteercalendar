"use client";

import { useEffect, useState, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  getServiceAssignments,
  updateAssignmentAttendance,
  getChurchDocuments,
} from "@/lib/firebase/firestore";
import { isAdmin, canScheduleMinistry } from "@/lib/utils/permissions";
import { useAuth } from "@/lib/context/auth-context";
import { printRoster } from "@/lib/utils/print-roster";
import type { Service, Assignment, Ministry, Volunteer, Membership } from "@/lib/types";

interface ServiceRosterProps {
  service: Service;
  serviceDate: string;
  churchId: string;
  open: boolean;
  onClose: () => void;
  canMarkAttendance?: boolean;
  activeMembership?: Membership | null;
  orgName?: string;
}

type Tab = "roster" | "attendance";
type ViewLevel = "org" | string; // "org" or a ministry_id

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

export function ServiceRoster({
  service,
  serviceDate,
  churchId,
  open,
  onClose,
  canMarkAttendance = false,
  activeMembership,
  orgName = "Organization",
}: ServiceRosterProps) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [volunteerNames, setVolunteerNames] = useState<Map<string, string>>(new Map());
  const [tab, setTab] = useState<Tab>("roster");
  const [viewLevel, setViewLevel] = useState<ViewLevel>("org");
  const [attendanceMap, setAttendanceMap] = useState<Map<string, boolean | null>>(new Map());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const isPastOrToday = serviceDate <= today;
  const showAttendanceTab = canMarkAttendance && isPastOrToday;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [assignData, minData, volData] = await Promise.all([
        getServiceAssignments(churchId, service.id, serviceDate),
        getChurchDocuments(churchId, "ministries"),
        getChurchDocuments(churchId, "volunteers"),
      ]);
      // Exclude declined assignments from roster
      const active = assignData.filter((a) => a.status !== "declined");
      setAssignments(active);
      setMinistries(minData as unknown as Ministry[]);

      // Build volunteer name lookup
      const vols = volData as unknown as Volunteer[];
      const nameMap = new Map<string, string>();
      for (const v of vols) {
        nameMap.set(v.id, v.name);
      }
      setVolunteerNames(nameMap);

      const aMap = new Map<string, boolean | null>();
      for (const a of active) {
        aMap.set(a.id, a.attended ?? null);
      }
      setAttendanceMap(aMap);
      setDirty(false);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [churchId, service.id, serviceDate]);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  // Close action menu on outside click
  useEffect(() => {
    if (!actionMenuId) return;
    function handler(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-action-menu]")) {
        setActionMenuId(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [actionMenuId]);

  // Build ministry name lookup
  const ministryNames = new Map<string, string>();
  for (const m of ministries) {
    ministryNames.set(m.id, m.name);
  }

  // Get unique ministry IDs from assignments
  const ministryIds = [...new Set(assignments.map((a) => a.ministry_id))];

  // Filter assignments by view level
  const filtered =
    viewLevel === "org"
      ? assignments
      : assignments.filter((a) => a.ministry_id === viewLevel);

  // Group by role
  const roleGroups = new Map<string, Assignment[]>();
  for (const a of filtered) {
    const key = a.role_id;
    if (!roleGroups.has(key)) roleGroups.set(key, []);
    roleGroups.get(key)!.push(a);
  }

  const toggleAttendance = (assignmentId: string) => {
    setAttendanceMap((prev) => {
      const next = new Map(prev);
      const current = next.get(assignmentId);
      if (current === null || current === undefined) {
        next.set(assignmentId, true);
      } else if (current === true) {
        next.set(assignmentId, false);
      } else {
        next.set(assignmentId, true);
      }
      return next;
    });
    setDirty(true);
  };

  const markAllPresent = () => {
    setAttendanceMap((prev) => {
      const next = new Map(prev);
      for (const a of filtered) {
        next.set(a.id, true);
      }
      return next;
    });
    setDirty(true);
  };

  const saveAttendance = async () => {
    setSaving(true);
    try {
      const promises: Promise<void>[] = [];
      for (const a of filtered) {
        const newVal = attendanceMap.get(a.id);
        if (newVal !== (a.attended ?? null)) {
          promises.push(
            updateAssignmentAttendance(churchId, a.id, newVal === true),
          );
        }
      }
      await Promise.all(promises);
      await loadData();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    setRemoving(assignmentId);
    try {
      const idToken = await user?.getIdToken();
      if (!idToken) return;
      const res = await fetch("/api/roster/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          church_id: churchId,
          action: "remove",
          item_type: "assignment",
          item_id: assignmentId,
          initiated_by_name: profile?.display_name || "Admin",
        }),
      });
      if (res.ok) await loadData();
    } catch {
      // silent
    } finally {
      setRemoving(null);
      setActionMenuId(null);
    }
  };

  const handleMoveAssignment = async (assignmentId: string, newRoleId: string, newRoleTitle: string) => {
    try {
      const idToken = await user?.getIdToken();
      if (!idToken) return;
      const res = await fetch("/api/roster/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          church_id: churchId,
          action: "move",
          item_type: "assignment",
          item_id: assignmentId,
          new_role_id: newRoleId,
          new_role_title: newRoleTitle,
          initiated_by_name: profile?.display_name || "Admin",
        }),
      });
      if (res.ok) await loadData();
    } catch {
      // silent
    } finally {
      setActionMenuId(null);
    }
  };

  // Get all distinct role_id + role_title combos from assignments for "Move to..." options
  const allRoles = [...new Map(assignments.map((a) => [a.role_id, a.role_title])).entries()];

  const subtitle = [
    formatDate(serviceDate),
    service.start_time ? formatTime(service.start_time) : service.all_day ? "All day" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Attendance stats
  const presentCount = filtered.filter((a) => attendanceMap.get(a.id) === true).length;
  const noShowCount = filtered.filter((a) => attendanceMap.get(a.id) === false).length;
  const unmarkedCount = filtered.filter((a) => attendanceMap.get(a.id) == null).length;

  return (
    <Modal open={open} onClose={onClose} title={service.name} subtitle={subtitle} maxWidth="max-w-3xl">
      {/* View level selector (Team / Org) */}
      {ministryIds.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5 no-print">
          <button
            onClick={() => setViewLevel("org")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              viewLevel === "org"
                ? "bg-vc-indigo text-white"
                : "bg-vc-bg-warm text-vc-text-muted hover:text-vc-indigo"
            }`}
          >
            All Teams
          </button>
          {ministryIds.map((mid) => (
            <button
              key={mid}
              onClick={() => setViewLevel(mid)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                viewLevel === mid
                  ? "bg-vc-indigo text-white"
                  : "bg-vc-bg-warm text-vc-text-muted hover:text-vc-indigo"
              }`}
            >
              {ministryNames.get(mid) || "Unknown"}
            </button>
          ))}
        </div>
      )}

      {/* Tab bar */}
      {showAttendanceTab && (
        <div className="mb-4 flex gap-1 rounded-lg bg-vc-bg-warm p-1 no-print">
          {(["roster", "attendance"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "bg-white text-vc-indigo shadow-sm"
                  : "text-vc-text-muted hover:text-vc-indigo"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-vc-border bg-vc-bg-warm/50 p-8 text-center">
          <p className="text-vc-text-muted">
            {viewLevel === "org"
              ? "No volunteers assigned for this service date."
              : `No volunteers assigned from ${ministryNames.get(viewLevel) || "this team"}.`}
          </p>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm text-vc-text-secondary">
                <span className="font-semibold text-vc-indigo">{filtered.length}</span> assigned
              </p>
              {tab === "attendance" && (
                <div className="flex items-center gap-2 text-xs text-vc-text-muted">
                  <span className="text-vc-sage">{presentCount} present</span>
                  {noShowCount > 0 && <span className="text-red-500">{noShowCount} no-show</span>}
                  {unmarkedCount > 0 && <span>{unmarkedCount} unmarked</span>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {tab === "attendance" && (
                <Button variant="ghost" size="sm" onClick={markAllPresent} className="no-print">
                  Mark all present
                </Button>
              )}
              <button
                onClick={() =>
                  printRoster({
                    title: service.name,
                    subtitle,
                    orgName,
                    roles: [...roleGroups.entries()].map(([, roleAssignments]) => ({
                      roleName: roleAssignments[0]?.role_title || "Role",
                      volunteers: roleAssignments.map((a) => ({
                        name: volunteerNames.get(a.volunteer_id) || "Unassigned",
                        status: a.status,
                      })),
                    })),
                  })
                }
                className="no-print flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-vc-text-muted hover:bg-vc-bg-warm hover:text-vc-indigo transition-colors"
                title="Print roster"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.25 7.034l-.25-.004" />
                </svg>
                Print
              </button>
            </div>
          </div>

          {/* Role groups */}
          <div className="space-y-4">
            {[...roleGroups.entries()].map(([roleId, roleAssignments]) => {
              const roleTitle = roleAssignments[0]?.role_title || roleId;
              return (
                <div key={roleId}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-vc-text-muted">
                      {roleTitle}
                    </h3>
                    <span className="text-xs text-vc-text-muted">
                      {roleAssignments.length} assigned
                    </span>
                  </div>
                  <div className="space-y-1">
                    {roleAssignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="flex items-center justify-between rounded-lg border border-vc-border-light bg-white px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-vc-indigo">
                            {volunteerNames.get(assignment.volunteer_id) || "Unassigned"}
                          </p>
                          <p className="text-xs text-vc-text-muted">
                            {viewLevel === "org"
                              ? ministryNames.get(assignment.ministry_id) || "—"
                              : assignment.role_title}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {tab === "roster" ? (
                            <AssignmentStatusBadge status={assignment.status} />
                          ) : (
                            <AttendanceToggle
                              value={attendanceMap.get(assignment.id) ?? null}
                              onClick={() => toggleAttendance(assignment.id)}
                            />
                          )}
                          {activeMembership && canScheduleMinistry(activeMembership, assignment.ministry_id) && tab === "roster" && (
                            <div className="relative no-print" data-action-menu>
                              <button
                                onClick={() => setActionMenuId(actionMenuId === assignment.id ? null : assignment.id)}
                                className="rounded p-1 text-vc-text-muted hover:bg-vc-bg-warm hover:text-vc-indigo"
                              >
                                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                </svg>
                              </button>
                              {actionMenuId === assignment.id && (
                                <div className="absolute right-0 top-8 z-10 w-44 rounded-lg border border-vc-border bg-white py-1 shadow-lg">
                                  <button
                                    onClick={() => handleRemoveAssignment(assignment.id)}
                                    disabled={removing === assignment.id}
                                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                                  >
                                    {removing === assignment.id ? "Removing..." : "Remove from role"}
                                  </button>
                                  {allRoles.filter(([rid]) => rid !== roleId).length > 0 && (
                                    <>
                                      <div className="mx-2 my-1 border-t border-vc-border-light" />
                                      <p className="px-3 py-1 text-[11px] font-medium uppercase text-vc-text-muted">Move to...</p>
                                      {allRoles
                                        .filter(([rid]) => rid !== roleId)
                                        .map(([rid, rtitle]) => (
                                          <button
                                            key={rid}
                                            onClick={() => handleMoveAssignment(assignment.id, rid, rtitle)}
                                            className="w-full px-3 py-2 text-left text-sm text-vc-text hover:bg-vc-bg-warm"
                                          >
                                            {rtitle}
                                          </button>
                                        ))}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save button for attendance */}
          {tab === "attendance" && dirty && (
            <div className="mt-6 flex justify-end border-t border-vc-border-light pt-4 no-print">
              <Button onClick={saveAttendance} loading={saving}>
                Save Attendance
              </Button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function AssignmentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    confirmed: "bg-vc-sage/15 text-vc-sage",
    draft: "bg-vc-sand/15 text-vc-sand",
    declined: "bg-gray-100 text-gray-500",
    no_show: "bg-red-50 text-red-600",
    substitute_requested: "bg-blue-50 text-blue-600",
  };
  const labels: Record<string, string> = {
    draft: "Awaiting",
    substitute_requested: "Sub needed",
    no_show: "No-show",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status] || "bg-gray-100 text-gray-500"}`}
    >
      {labels[status] || status}
    </span>
  );
}

function AttendanceToggle({
  value,
  onClick,
}: {
  value: boolean | null;
  onClick: () => void;
}) {
  if (value === true) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 rounded-full bg-vc-sage/15 px-2.5 py-1 text-xs font-medium text-vc-sage transition-colors hover:bg-vc-sage/25"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Present
      </button>
    );
  }
  if (value === false) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        No-show
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-200"
    >
      Not marked
    </button>
  );
}
