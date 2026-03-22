"use client";

import { Badge } from "@/components/ui/badge";
import { formatPhone } from "@/lib/utils/phone";
import { getOrgEligibility, type OrgEligibility } from "@/lib/utils/eligibility";
import type { Volunteer, Membership, OnboardingStep, OrgRole } from "@/lib/types";

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

const ELIGIBILITY_CONFIG: Record<OrgEligibility, { color: string; ring: string; label: string } | null> = {
  cleared: { color: "bg-vc-sage", ring: "ring-vc-sage/30", label: "Cleared to serve" },
  in_progress: { color: "bg-vc-sand", ring: "ring-vc-sand/30", label: "Onboarding in progress" },
  not_started: { color: "bg-vc-text-muted/60", ring: "ring-vc-text-muted/20", label: "Onboarding not started" },
  no_prereqs: null,
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

interface PersonCardProps {
  volunteer: Volunteer;
  membership: Membership | null;
  orgPrereqs: OnboardingStep[];
  getMinistryName: (id: string) => string;
  getMinistryColor: (id: string) => string;
  onClick: () => void;
}

export function PersonCard({
  volunteer: v,
  membership: mem,
  orgPrereqs,
  getMinistryName,
  getMinistryColor,
  onClick,
}: PersonCardProps) {
  const isArchived = v.status === "archived";
  const eligibility = getOrgEligibility(v, orgPrereqs);
  const eligConfig = ELIGIBILITY_CONFIG[eligibility];

  return (
    <div
      className={`group relative rounded-xl border border-vc-border-light bg-white p-4 cursor-pointer
        transition-all duration-200 hover:shadow-lg hover:shadow-vc-indigo/[0.04] hover:-translate-y-0.5
        active:scale-[0.99] active:shadow-md
        ${isArchived ? "opacity-55" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
    >
      {/* Warm accent line on hover */}
      <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-vc-coral opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

      {/* Top row: avatar + name + badges */}
      <div className="flex items-start gap-3">
        {/* Avatar with eligibility ring */}
        <div className="relative shrink-0">
          <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-vc-indigo/8 text-[13px] font-semibold text-vc-indigo
            transition-colors duration-200 group-hover:bg-vc-indigo/12`}>
            {getInitials(v.name)}
          </div>
          {eligConfig && (
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ${eligConfig.color} ring-2 ${eligConfig.ring} ring-offset-1 ring-offset-white`}
              title={eligConfig.label}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-display text-[15px] leading-snug truncate ${isArchived ? "text-vc-text-muted" : "text-vc-indigo"}`}>
              {v.name}
            </span>
            {isArchived && (
              <Badge variant="default">Archived</Badge>
            )}
            {mem && (
              <Badge variant={ROLE_VARIANTS[mem.role]}>{ROLE_LABELS[mem.role]}</Badge>
            )}
            {!mem && (
              <span className="rounded-full bg-vc-bg-cream px-2 py-0.5 text-[10px] font-medium text-vc-text-muted">Roster only</span>
            )}
          </div>

          {/* Contact */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-vc-text-secondary">
            {v.email && <span className="truncate">{v.email}</span>}
            {v.phone && (
              <span className="flex items-center gap-1 text-vc-text-muted">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                </svg>
                {formatPhone(v.phone)}
              </span>
            )}
          </div>
        </div>

        {/* Chevron hint */}
        <svg className="mt-1 h-4 w-4 shrink-0 text-vc-text-muted/40 transition-all duration-200 group-hover:text-vc-coral group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </div>

      {/* Ministry pills */}
      {v.ministry_ids.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 pl-14">
          {v.ministry_ids.map((mid) => (
            <span
              key={mid}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: getMinistryColor(mid) + "18", color: getMinistryColor(mid) }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getMinistryColor(mid) }} />
              {getMinistryName(mid)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
