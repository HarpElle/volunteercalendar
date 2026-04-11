"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DataList, DataListRow, DataListCell } from "@/components/ui/data-list";
import { parseName } from "@/lib/utils/name";
import { getOrgEligibility, type OrgEligibility } from "@/lib/utils/eligibility";
import type { Person, Membership, OnboardingStep, OrgRole } from "@/lib/types";

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  scheduler: "Scheduler",
  volunteer: "Volunteer",
};

const ROLE_VARIANTS: Record<OrgRole, "primary" | "accent" | "default"> = {
  owner: "primary",
  admin: "primary",
  scheduler: "accent",
  volunteer: "default",
};

const ELIGIBILITY_LABELS: Record<OrgEligibility, { color: string; dotColor: string; label: string } | null> = {
  cleared: { color: "text-vc-sage", dotColor: "bg-vc-sage", label: "Cleared" },
  in_progress: { color: "text-vc-sand-dark", dotColor: "bg-vc-sand", label: "In Progress" },
  not_started: { color: "text-vc-text-muted", dotColor: "bg-vc-text-muted/60", label: "Not Started" },
  no_prereqs: null,
};

interface PersonRow {
  volunteer: Person;
  membership: Membership | null;
}

interface PeopleTableProps {
  people: PersonRow[];
  orgPrereqs: OnboardingStep[];
  getMinistryName: (id: string) => string;
  getMinistryColor: (id: string) => string;
  onSelectPerson: (v: Person, m: Membership | null) => void;
}

type SortField = "first" | "last";

function getVolunteerNames(v: Person) {
  if (v.first_name !== undefined && v.last_name !== undefined) {
    return { first: v.first_name, last: v.last_name };
  }
  const parsed = parseName(v.name);
  return { first: parsed.first_name, last: parsed.last_name };
}

/**
 * Desktop table view for the People roster. Uses DataList for consistent styling.
 */
export function PeopleTable({
  people,
  orgPrereqs,
  getMinistryName,
  getMinistryColor,
  onSelectPerson,
}: PeopleTableProps) {
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [sortField, setSortField] = useState<SortField>("first");

  const sorted = [...people].sort((a, b) => {
    const aN = getVolunteerNames(a.volunteer);
    const bN = getVolunteerNames(b.volunteer);
    const aVal = sortField === "last" ? (aN.last || aN.first) : aN.first;
    const bVal = sortField === "last" ? (bN.last || bN.first) : bN.first;
    const cmp = aVal.localeCompare(bVal);
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center gap-4 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-vc-text-muted">
        <div className="flex flex-1 items-center gap-2">
          <button
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="flex items-center gap-1 hover:text-vc-indigo transition-colors"
          >
            Name
            <svg
              className={`h-3 w-3 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          <span className="text-vc-text-muted/50">|</span>
          <button
            onClick={() => setSortField("first")}
            className={`transition-colors ${sortField === "first" ? "text-vc-indigo" : "hover:text-vc-indigo"}`}
          >
            First
          </button>
          <button
            onClick={() => setSortField("last")}
            className={`transition-colors ${sortField === "last" ? "text-vc-indigo" : "hover:text-vc-indigo"}`}
          >
            Last
          </button>
        </div>
        <span className="w-40">Teams</span>
        <span className="hidden sm:block w-24">Role</span>
        <span className="w-24">Status</span>
      </div>

      {/* Data rows */}
      <DataList>
        {sorted.map(({ volunteer: v, membership: mem }) => {
          const isArchived = v.status === "archived";
          const eligibility = getOrgEligibility(v, orgPrereqs);
          const eligConfig = ELIGIBILITY_LABELS[eligibility];
          const role = mem?.role;

          return (
            <DataListRow
              key={v.id}
              onClick={() => onSelectPerson(v, mem)}
              className={isArchived ? "opacity-55" : ""}
            >
              {/* Avatar + Name */}
              <DataListCell flex="grow">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={v.name}
                    photoUrl={v.photo_url}
                    size="sm"
                    eligibility={eligibility}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-vc-indigo truncate">{v.name}</p>
                    {v.email && (
                      <p className="lg:hidden text-xs text-vc-text-muted truncate">{v.email}</p>
                    )}
                  </div>
                </div>
              </DataListCell>

              {/* Teams */}
              <DataListCell className="w-40">
                <div className="flex flex-wrap gap-1">
                  {v.ministry_ids.slice(0, 2).map((mid) => (
                    <span
                      key={mid}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: getMinistryColor(mid) + "18",
                        color: getMinistryColor(mid),
                      }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getMinistryColor(mid) }} />
                      {getMinistryName(mid)}
                    </span>
                  ))}
                  {v.ministry_ids.length > 2 && (
                    <span className="text-[11px] text-vc-text-muted">+{v.ministry_ids.length - 2}</span>
                  )}
                  {v.ministry_ids.length === 0 && (
                    <span className="text-xs text-vc-text-muted">{"\u2014"}</span>
                  )}
                </div>
              </DataListCell>

              {/* Org Role — hidden on very small screens */}
              <DataListCell className="hidden sm:block w-24">
                {role && role !== "volunteer" ? (
                  <Badge variant={ROLE_VARIANTS[role]}>{ROLE_LABELS[role]}</Badge>
                ) : !mem ? (
                  <span className="text-[10px] text-vc-text-muted">Roster only</span>
                ) : null}
              </DataListCell>

              {/* Eligibility */}
              <DataListCell className="w-24">
                {eligConfig ? (
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${eligConfig.color}`}>
                    <span className={`h-2 w-2 rounded-full ${eligConfig.dotColor}`} />
                    {eligConfig.label}
                  </span>
                ) : isArchived ? (
                  <Badge variant="default">Archived</Badge>
                ) : null}
              </DataListCell>
            </DataListRow>
          );
        })}
      </DataList>

      {sorted.length === 0 && (
        <div className="py-12 text-center text-sm text-vc-text-muted">
          No volunteers match your filters.
        </div>
      )}
    </div>
  );
}

/**
 * Mobile compact list view for People roster.
 */
export function PeopleList({
  people,
  orgPrereqs,
  getMinistryName,
  getMinistryColor,
  onSelectPerson,
}: PeopleTableProps) {
  const sorted = [...people].sort((a, b) =>
    a.volunteer.name.localeCompare(b.volunteer.name),
  );

  return (
    <DataList>
      {sorted.map(({ volunteer: v, membership: mem }) => {
        const isArchived = v.status === "archived";
        const eligibility = getOrgEligibility(v, orgPrereqs);

        return (
          <DataListRow
            key={v.id}
            onClick={() => onSelectPerson(v, mem)}
            className={isArchived ? "opacity-55" : ""}
          >
            <Avatar
              name={v.name}
              photoUrl={v.photo_url}
              size="sm"
              eligibility={eligibility}
            />
            <DataListCell flex="grow">
              <p className="text-sm font-medium text-vc-indigo truncate">{v.name}</p>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {v.ministry_ids.slice(0, 2).map((mid) => (
                  <span
                    key={mid}
                    className="inline-flex items-center gap-0.5 text-[10px] font-medium"
                    style={{ color: getMinistryColor(mid) }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getMinistryColor(mid) }} />
                    {getMinistryName(mid)}
                  </span>
                ))}
                {v.ministry_ids.length > 2 && (
                  <span className="text-[10px] text-vc-text-muted">+{v.ministry_ids.length - 2}</span>
                )}
              </div>
            </DataListCell>
            <svg className="h-4 w-4 shrink-0 text-vc-text-muted/40" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </DataListRow>
        );
      })}

      {sorted.length === 0 && (
        <div className="py-12 text-center text-sm text-vc-text-muted">
          No volunteers match your filters.
        </div>
      )}
    </DataList>
  );
}
