"use client";

import { CheckInQR } from "@/components/ui/check-in-qr";
import type { Assignment, Service, Ministry } from "@/lib/types";

interface ServiceDateGroup {
  date: string;
  service: Service;
  assignments: Assignment[];
  totalRoles: number;
}

interface ServiceDateTileProps {
  group: ServiceDateGroup;
  ministryMap: Map<string, Ministry>;
  onClick?: () => void;
  /** Codex Run 2 Phase 3 (2026-05-17): when provided, renders the QR check-in
   *  icon button in the tile's top-right corner. The CheckInQR component is
   *  self-contained — generates the code via /api/check-in and shows the QR
   *  in a modal. Click on the QR icon does not bubble to the tile's onClick. */
  churchId?: string;
}

function formatDateLong(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function ServiceDateTile({ group, onClick, churchId }: ServiceDateTileProps) {
  const { date, service, assignments, totalRoles } = group;

  const confirmed = assignments.filter((a) => a.status === "confirmed").length;
  const awaiting = assignments.filter((a) => a.status === "draft").length;
  const declined = assignments.filter((a) => a.status === "declined").length;
  const filled = confirmed;
  const unfilled = Math.max(0, totalRoles - assignments.length);
  const fillPct = totalRoles > 0 ? Math.round((confirmed / totalRoles) * 100) : 0;
  const hasGaps = unfilled > 0 || declined > 0 || awaiting > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className="w-full rounded-xl border border-vc-border-light bg-white p-4 text-left transition-all hover:shadow-sm hover:border-vc-coral/30 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-vc-indigo truncate">
            {service.name}
          </p>
          <p className="mt-0.5 text-xs text-vc-text-muted">
            {formatDateLong(date)}
            {service.start_time ? ` · ${service.start_time}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasGaps ? (
            <span className="rounded-full bg-vc-sand/25 px-2 py-0.5 text-xs font-medium text-vc-warning">
              Needs attention
            </span>
          ) : (
            <span className="rounded-full bg-vc-sage/15 px-2 py-0.5 text-xs font-medium text-vc-sage">
              All set
            </span>
          )}
          {churchId && (
            // Stop click propagation so the QR icon doesn't also open the
            // roster modal that the tile-click triggers.
            <div onClick={(e) => e.stopPropagation()}>
              <CheckInQR
                churchId={churchId}
                serviceId={service.id}
                serviceDate={date}
                serviceName={service.name}
              />
            </div>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-vc-text-muted">
          {totalRoles} role{totalRoles !== 1 ? "s" : ""}
        </span>
        {confirmed > 0 && (
          <span className="text-vc-sage font-medium">{confirmed} confirmed</span>
        )}
        {awaiting > 0 && (
          <span className="text-vc-warning font-medium">{awaiting} awaiting</span>
        )}
        {declined > 0 && (
          <span className="text-vc-danger font-medium">{declined} declined</span>
        )}
        {unfilled > 0 && (
          <span className="text-vc-text-muted font-medium">{unfilled} unfilled</span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mt-2.5 h-1.5 rounded-full bg-vc-bg-warm overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            fillPct >= 100
              ? "bg-vc-sage"
              : fillPct >= 50
                ? "bg-vc-sage/70"
                : "bg-vc-sand"
          }`}
          style={{ width: `${Math.min(fillPct, 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Group assignments by (service_id, service_date) and attach service metadata */
export function groupAssignmentsByServiceDate(
  assignments: Assignment[],
  services: Service[],
): ServiceDateGroup[] {
  const serviceMap = new Map(services.map((s) => [s.id, s]));
  const map = new Map<string, ServiceDateGroup>();

  for (const a of assignments) {
    if (!a.service_id || !a.service_date) continue;
    const key = `${a.service_id}__${a.service_date}`;
    let group = map.get(key);
    if (!group) {
      const svc = serviceMap.get(a.service_id);
      if (!svc) continue;
      // Count total roles for this service
      const totalRoles = svc.roles?.reduce((sum, r) => sum + r.count, 0) ?? 0;
      group = { date: a.service_date, service: svc, assignments: [], totalRoles };
      map.set(key, group);
    }
    group.assignments.push(a);
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
