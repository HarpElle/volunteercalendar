"use client";

import { useCampusName } from "@/lib/context/campus-context";

/**
 * Pass H Phase 1: inline campus context badge.
 *
 * Renders a small pill showing the campus name for a given campus id.
 * Hides itself if the campus id is null/undefined (e.g. for org-wide
 * services) OR if the org isn't multi-campus (no need to show "North
 * Campus" if there's only one campus).
 *
 * Use in lists / cards where the entity has a campus_id and the
 * surrounding view might include entities from multiple campuses.
 */
export function CampusBadge({
  campusId,
  hideWhenSingleCampus = true,
}: {
  campusId: string | null | undefined;
  /** Default true: hide the badge entirely when the org has <2 campuses. */
  hideWhenSingleCampus?: boolean;
}) {
  const name = useCampusName(campusId);

  if (!campusId || !name) return null;
  // Hide for single-campus orgs by default — no value in showing
  // "North Campus" on every card if there's only one campus.
  if (hideWhenSingleCampus && !name) return null;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-vc-sand/30 px-2 py-0.5 text-[10px] font-medium text-vc-text-secondary"
      title={`Campus: ${name}`}
    >
      📍 {name}
    </span>
  );
}
