"use client";

import { useMemo } from "react";
import { generateOccurrences } from "@/lib/services/scheduler";
import { getServiceMinistries, getServiceMinistryIds } from "@/lib/utils/service-helpers";
import type { Service, Ministry, Schedule } from "@/lib/types";

interface SelfServiceOpenSlotsProps {
  schedule: Schedule;
  services: Service[];
  ministries: Ministry[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Renders a Self-Service schedule's open claimable slots when no
 * assignments exist yet. Mirrors the matrix's by-date layout so admins
 * can visually verify coverage even though the matrix early-returns on
 * zero assignments.
 *
 * Codex Run 3 PR #27 retest (2026-05-17): Self-Service drafts were
 * showing "No Assignments Generated → the selected team has no
 * volunteers" — false and contradicted the wizard's promise.
 */
export function SelfServiceOpenSlots({
  schedule,
  services,
  ministries,
}: SelfServiceOpenSlotsProps) {
  const ministryMap = useMemo(
    () => new Map(ministries.map((m) => [m.id, m])),
    [ministries],
  );

  // Scope to the schedule's selected ministries (if any) so a self-service
  // draft scoped to "Worship Team" doesn't render slots from unrelated
  // services. Empty ministry_ids means org-wide.
  const scopedServices = useMemo(() => {
    const scopedMinistryIds = schedule.ministry_ids || [];
    if (scopedMinistryIds.length === 0) return services;
    return services.filter((s) => {
      const ids = getServiceMinistryIds(s);
      return scopedMinistryIds.some((id) => ids.includes(id));
    });
  }, [services, schedule.ministry_ids]);

  const occurrences = useMemo(
    () =>
      generateOccurrences(
        scopedServices,
        schedule.date_range_start,
        schedule.date_range_end,
      ),
    [scopedServices, schedule.date_range_start, schedule.date_range_end],
  );

  // Group by date, then service inside each date
  const byDate = useMemo(() => {
    const groups = new Map<string, { service: Service }[]>();
    for (const occ of occurrences) {
      const list = groups.get(occ.date) || [];
      list.push({ service: occ.service });
      groups.set(occ.date, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [occurrences]);

  if (occurrences.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-vc-border bg-white p-10 text-center">
        <p className="text-vc-text-secondary">
          No services fall within {schedule.date_range_start} to{" "}
          {schedule.date_range_end}. Add services to enable open slots.
        </p>
      </div>
    );
  }

  const totalOpenSlots = occurrences.reduce((sum, occ) => {
    const sms = getServiceMinistries(occ.service, occ.date);
    return sum + sms.reduce(
      (n, sm) => n + sm.roles.reduce((m, r) => m + r.count, 0),
      0,
    );
  }, 0);

  return (
    <div>
      <div className="mb-4 rounded-lg border border-vc-coral/30 bg-vc-coral/5 px-4 py-3 text-sm text-vc-text-secondary">
        <p className="font-semibold text-vc-indigo">
          {totalOpenSlots} open slot{totalOpenSlots !== 1 ? "s" : ""} across{" "}
          {occurrences.length} service occurrence
          {occurrences.length !== 1 ? "s" : ""}
        </p>
        <p className="mt-0.5 text-xs">
          Self-Service: volunteers will claim these from{" "}
          <strong>My Schedule</strong>. Open slots stay visible until claimed
          or the schedule is published.
        </p>
      </div>

      <div className="space-y-4">
        {byDate.map(([date, services]) => (
          <div
            key={date}
            className="rounded-xl border border-vc-border-light bg-white overflow-hidden"
          >
            <div className="border-b border-vc-border-light bg-vc-bg-warm px-5 py-3">
              <h3 className="font-semibold text-vc-indigo">{formatDate(date)}</h3>
            </div>
            <div className="divide-y divide-vc-border-light">
              {services.map(({ service }) => {
                const ministryIds = getServiceMinistryIds(service);
                const primaryMinistry = ministryMap.get(ministryIds[0]);
                const ministryNames = ministryIds
                  .map((id) => ministryMap.get(id)?.name)
                  .filter(Boolean)
                  .join(", ");
                const sms = getServiceMinistries(service, date);

                return (
                  <div key={`${service.id}_${date}`} className="px-5 py-3">
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
                    {sms.map((sm) => {
                      const ministry = ministryMap.get(sm.ministry_id);
                      const showGroupHeader = sms.length > 1;
                      return (
                        <div key={sm.ministry_id} className="mb-2 last:mb-0">
                          {showGroupHeader && (
                            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-vc-text-secondary">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: ministry?.color || "#ccc" }}
                              />
                              {ministry?.name || "General"}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {sm.roles.flatMap((role) =>
                              Array.from({ length: role.count }, (_, i) => (
                                <div
                                  key={`${role.role_id}_${i}`}
                                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-vc-danger/30 bg-vc-danger/5 px-3 py-1.5 text-sm text-vc-danger"
                                >
                                  <svg
                                    className="h-3.5 w-3.5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                                    />
                                  </svg>
                                  1× {role.title} needed
                                </div>
                              )),
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
