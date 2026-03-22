"use client";

import { useState } from "react";
import type { Ministry, OrgRole, OnboardingStep } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoleOption {
  role_id: string;
  title: string;
  ministry_id: string;
}

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  scheduler: "Scheduler",
  volunteer: "Volunteer",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;

  filterMinistries: string[];
  onFilterMinistriesChange: (ids: string[]) => void;

  filterRoles: string[];
  onFilterRolesChange: (ids: string[]) => void;

  filterStatus: "active" | "archived" | "all";
  onFilterStatusChange: (s: "active" | "archived" | "all") => void;

  filterTeam: "all" | "on-team" | "no-team";
  onFilterTeamChange: (t: "all" | "on-team" | "no-team") => void;

  filterOrgRoles: OrgRole[];
  onFilterOrgRolesChange: (roles: OrgRole[]) => void;

  filterEligibility: "all" | "cleared" | "pending";
  onFilterEligibilityChange: (e: "all" | "cleared" | "pending") => void;

  activeFilterCount: number;

  ministries: Ministry[];
  uniqueRoles: RoleOption[];
  orgPrereqs: OnboardingStep[];
  /** Label for the ministry/team concept (e.g. "Ministries", "Teams") */
  teamLabel: string;
}

// ---------------------------------------------------------------------------
// FilterBar
// ---------------------------------------------------------------------------

export function FilterBar({
  searchQuery,
  onSearchChange,
  filterMinistries,
  onFilterMinistriesChange,
  filterRoles,
  onFilterRolesChange,
  filterStatus,
  onFilterStatusChange,
  filterTeam,
  onFilterTeamChange,
  filterOrgRoles,
  onFilterOrgRolesChange,
  filterEligibility,
  onFilterEligibilityChange,
  activeFilterCount,
  ministries,
  uniqueRoles,
  orgPrereqs,
  teamLabel,
}: FilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const hasFilterOptions = ministries.length > 0 || uniqueRoles.length > 0;

  function toggleMinistry(id: string) {
    onFilterMinistriesChange(
      filterMinistries.includes(id)
        ? filterMinistries.filter((x) => x !== id)
        : [...filterMinistries, id],
    );
  }

  function toggleRole(id: string) {
    onFilterRolesChange(
      filterRoles.includes(id)
        ? filterRoles.filter((x) => x !== id)
        : [...filterRoles, id],
    );
  }

  function toggleOrgRole(role: OrgRole) {
    onFilterOrgRolesChange(
      filterOrgRoles.includes(role)
        ? filterOrgRoles.filter((x) => x !== role)
        : [...filterOrgRoles, role],
    );
  }

  function clearAll() {
    onFilterMinistriesChange([]);
    onFilterRolesChange([]);
    onFilterOrgRolesChange([]);
    onFilterEligibilityChange("all");
    onFilterStatusChange("active");
    onFilterTeamChange("all");
  }

  return (
    <div className="mb-4 space-y-3">
      {/* Search + filter toggle */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          placeholder="Search by name, email, or phone..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-vc-border bg-white px-3 py-2.5 text-sm text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
        />
        {hasFilterOptions && (
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
              showFilters || activeFilterCount > 0
                ? "border-vc-coral bg-vc-coral/10 text-vc-coral"
                : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
            </svg>
            Filter
            {activeFilterCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-vc-coral text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Collapsible filter panel */}
      {showFilters && (
        <div className="rounded-xl border border-vc-border-light bg-white p-4 space-y-4">
          {/* Status & Team filters */}
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => onFilterStatusChange(e.target.value as "active" | "archived" | "all")}
                className="rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20 min-h-[44px]"
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
                Team
              </label>
              <select
                value={filterTeam}
                onChange={(e) => onFilterTeamChange(e.target.value as "all" | "on-team" | "no-team")}
                className="rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20 min-h-[44px]"
              >
                <option value="all">All</option>
                <option value="on-team">On a Team</option>
                <option value="no-team">Not on Any Team</option>
              </select>
            </div>
          </div>

          {/* Ministry toggles */}
          {ministries.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
                {teamLabel}
              </label>
              <div className="flex flex-wrap gap-2">
                {ministries.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => toggleMinistry(m.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all min-h-[44px] ${
                      filterMinistries.includes(m.id)
                        ? "border-transparent text-white"
                        : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                    }`}
                    style={filterMinistries.includes(m.id) ? { backgroundColor: m.color } : undefined}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: filterMinistries.includes(m.id) ? "white" : m.color }}
                    />
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Role toggles */}
          {uniqueRoles.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
                Roles
              </label>
              <div className="flex flex-wrap gap-2">
                {uniqueRoles.map((r) => (
                  <button
                    key={r.role_id}
                    onClick={() => toggleRole(r.role_id)}
                    className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-all min-h-[44px] ${
                      filterRoles.includes(r.role_id)
                        ? "border-vc-coral bg-vc-coral/10 text-vc-coral"
                        : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                    }`}
                  >
                    {r.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Org Role toggles */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
              Org Role
            </label>
            <div className="flex flex-wrap gap-2">
              {(["owner", "admin", "scheduler", "volunteer"] as OrgRole[]).map((role) => (
                <button
                  key={role}
                  onClick={() => toggleOrgRole(role)}
                  className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-all min-h-[44px] ${
                    filterOrgRoles.includes(role)
                      ? "border-vc-indigo bg-vc-indigo/10 text-vc-indigo"
                      : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                  }`}
                >
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          </div>

          {/* Eligibility toggles (conditional on org having prereqs) */}
          {orgPrereqs.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
                Eligibility
              </label>
              <div className="flex flex-wrap gap-2">
                {([["all", "All"], ["cleared", "Cleared"], ["pending", "Pending"]] as const).map(([val, lbl]) => (
                  <button
                    key={val}
                    onClick={() => onFilterEligibilityChange(val)}
                    className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-all min-h-[44px] ${
                      filterEligibility === val
                        ? val === "cleared" ? "border-vc-sage bg-vc-sage/10 text-vc-sage"
                          : val === "pending" ? "border-vc-sand bg-vc-sand/10 text-vc-sand"
                          : "border-vc-indigo bg-vc-indigo/10 text-vc-indigo"
                        : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clear all */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearAll}
              className="text-xs font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
