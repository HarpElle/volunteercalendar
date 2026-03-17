import type { OrgType } from "@/lib/types";

/**
 * Returns org-appropriate terminology.
 * Churches use "Ministry" / "Ministries"; other orgs use "Team" / "Teams".
 */
export function getOrgTerms(orgType: OrgType | undefined) {
  const isChurch = !orgType || orgType === "church";
  return {
    singular: isChurch ? "Ministry" : "Team",
    plural: isChurch ? "Ministries" : "Teams",
    singularLower: isChurch ? "ministry" : "team",
    pluralLower: isChurch ? "ministries" : "teams",
  };
}
