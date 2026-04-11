"use client";

import { useState } from "react";
import type { Assignment, Service, Ministry, Person, Membership } from "@/lib/types";
import { canScheduleMinistry } from "@/lib/utils/permissions";
import { SelfRemoveModal } from "@/components/scheduling/self-remove-modal";
import Link from "next/link";

interface TeamScheduleViewProps {
  myMinistryIds: string[];
  myVolunteerId: string;
  allAssignments: Assignment[];
  services: Map<string, Service>;
  ministries: Map<string, Ministry>;
  volunteers: Map<string, Person>;
  activeMembership: Membership | null;
  churchId?: string;
  onAssignmentRemoved?: (assignmentId: string) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = Number(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}

interface DateServiceGroup {
  date: string;
  serviceId: string;
  serviceName: string;
  startTime: string | null;
  allDay: boolean;
  roles: Map<string, { roleTitle: string; assignments: Assignment[] }>;
}

export function TeamScheduleView({
  myMinistryIds,
  myVolunteerId,
  allAssignments,
  services,
  ministries,
  volunteers,
  activeMembership,
  churchId,
  onAssignmentRemoved,
}: TeamScheduleViewProps) {
  const [selectedMinistry, setSelectedMinistry] = useState<string>("all");
  const [removeItem, setRemoveItem] = useState<{ id: string; roleName: string; serviceName: string; date: string } | null>(null);

  const today = new Date().toISOString().split("T")[0];

  // Filter assignments to my ministries, upcoming, non-declined
  const filtered = allAssignments.filter((a) => {
    if (a.status === "declined") return false;
    if (a.service_date < today) return false;
    if (selectedMinistry === "all") {
      return myMinistryIds.includes(a.ministry_id);
    }
    return a.ministry_id === selectedMinistry;
  });

  // Group by date → service → role
  const groupMap = new Map<string, DateServiceGroup>();
  for (const a of filtered) {
    const key = `${a.service_date}|${a.service_id || "none"}`;
    if (!groupMap.has(key)) {
      const svc = a.service_id ? services.get(a.service_id) : null;
      groupMap.set(key, {
        date: a.service_date,
        serviceId: a.service_id || "",
        serviceName: svc?.name || "Service",
        startTime: svc?.start_time || null,
        allDay: svc?.all_day || false,
        roles: new Map(),
      });
    }
    const group = groupMap.get(key)!;
    if (!group.roles.has(a.role_id)) {
      group.roles.set(a.role_id, { roleTitle: a.role_title, assignments: [] });
    }
    group.roles.get(a.role_id)!.assignments.push(a);
  }

  // Sort groups by date (nearest first), then by service start time
  const groups = [...groupMap.values()].sort((a, b) => {
    const dateComp = a.date.localeCompare(b.date);
    if (dateComp !== 0) return dateComp;
    return (a.startTime || "").localeCompare(b.startTime || "");
  });

  // Check if user is scheduler for the selected ministry
  const showManageLink =
    selectedMinistry !== "all" &&
    activeMembership &&
    canScheduleMinistry(activeMembership, selectedMinistry);

  return (
    <div>
      {/* Ministry filter pills */}
      {myMinistryIds.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedMinistry("all")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedMinistry === "all"
                ? "bg-vc-indigo text-white"
                : "bg-vc-bg-warm text-vc-text-muted hover:text-vc-indigo"
            }`}
          >
            All My Teams
          </button>
          {myMinistryIds.map((mid) => (
            <button
              key={mid}
              onClick={() => setSelectedMinistry(mid)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedMinistry === mid
                  ? "bg-vc-indigo text-white"
                  : "bg-vc-bg-warm text-vc-text-muted hover:text-vc-indigo"
              }`}
            >
              {ministries.get(mid)?.name || "Team"}
            </button>
          ))}
        </div>
      )}

      {/* Manage link for schedulers */}
      {showManageLink && (
        <div className="mb-4">
          <Link
            href="/dashboard/schedules"
            className="inline-flex items-center gap-1 text-xs text-vc-coral hover:underline"
          >
            Manage in Schedules
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      )}

      {/* Empty state */}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
          <svg className="mx-auto h-10 w-10 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
          </svg>
          <p className="mt-3 text-vc-text-secondary">
            {myMinistryIds.length === 0
              ? "You're not connected to any teams yet."
              : "No upcoming team assignments."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={`${group.date}-${group.serviceId}`}>
              {/* Date + service header */}
              <div className="mb-2">
                <p className="font-semibold text-vc-indigo">{formatDate(group.date)}</p>
                <p className="text-sm text-vc-text-secondary">
                  {group.serviceName}
                  {group.allDay
                    ? " · All day"
                    : group.startTime
                      ? ` · ${formatTime(group.startTime)}`
                      : ""}
                </p>
              </div>

              {/* Role groups */}
              <div className="space-y-2">
                {[...group.roles.values()].map((roleGroup) => (
                  <div key={roleGroup.roleTitle} className="rounded-xl border border-vc-border-light bg-white overflow-hidden">
                    <div className="bg-vc-bg-warm/50 px-4 py-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-vc-text-muted">
                        {roleGroup.roleTitle}
                      </span>
                    </div>
                    <div className="divide-y divide-vc-border-light">
                      {roleGroup.assignments.map((a) => {
                        const vol = volunteers.get(a.volunteer_id);
                        const isMe = a.volunteer_id === myVolunteerId;
                        return (
                          <div
                            key={a.id}
                            className={`flex items-center justify-between px-4 py-2.5 ${
                              isMe ? "border-l-2 border-l-vc-coral bg-vc-coral/[0.03]" : ""
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm ${isMe ? "font-semibold text-vc-indigo" : "font-medium text-vc-indigo"}`}>
                                {vol?.name || "Unassigned"}
                                {isMe && (
                                  <span className="ml-1.5 text-[10px] font-medium text-vc-coral">You</span>
                                )}
                              </p>
                              {selectedMinistry === "all" && (
                                <p className="text-xs text-vc-text-muted">
                                  {ministries.get(a.ministry_id)?.name || ""}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <StatusBadge status={a.status} />
                              {isMe && a.status !== "declined" && churchId && (
                                <button
                                  onClick={() => setRemoveItem({
                                    id: a.id,
                                    roleName: a.role_title,
                                    serviceName: group.serviceName,
                                    date: group.date,
                                  })}
                                  className="text-xs text-vc-text-muted hover:text-vc-danger transition-colors"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Self-removal modal */}
      {removeItem && churchId && (
        <SelfRemoveModal
          open={!!removeItem}
          onClose={() => setRemoveItem(null)}
          onRemoved={() => {
            onAssignmentRemoved?.(removeItem.id);
            setRemoveItem(null);
          }}
          churchId={churchId}
          itemType="assignment"
          itemId={removeItem.id}
          roleName={removeItem.roleName}
          serviceName={removeItem.serviceName}
          serviceDate={removeItem.date}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    confirmed: "bg-vc-sage/15 text-vc-sage",
    draft: "bg-vc-bg-cream text-vc-text-muted",
    declined: "bg-vc-danger/10 text-vc-danger",
    no_show: "bg-vc-danger/5 text-vc-danger",
    substitute_requested: "bg-vc-indigo/10 text-vc-indigo",
  };
  const labels: Record<string, string> = {
    draft: "Awaiting",
    substitute_requested: "Sub needed",
    no_show: "No-show",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status] || "bg-vc-bg-cream text-vc-text-muted"}`}
    >
      {labels[status] || status}
    </span>
  );
}
