import type { OrgType } from "@/lib/types";

/**
 * Returns org-appropriate terminology for the "team" concept.
 *
 * Wave 5 H.8 — standardized on "Team" / "Teams" for ALL org types
 * (was branched: churches → "Ministry/Ministries", others → "Team/Teams").
 * Decision baked in the launch-readiness plan: a single user-facing
 * vocabulary makes the product easier to talk about, train on, and
 * write docs for. Churches that prefer "ministry" can still use that
 * word in their team _names_ (e.g. "Worship Ministry") — only the
 * UI chrome standardizes on Team.
 *
 * Code identifiers (Firestore `ministries` collection, the `Ministry`
 * TS type, `ministryId` props, `getMinistryName` helpers) intentionally
 * stay as-is. Renaming those would touch hundreds of files for zero
 * user-visible benefit and risks breaking the data layer. See the
 * Glossary section in CLAUDE.md for the canonical split.
 *
 * The `orgType` parameter is kept on the signature for backward
 * compatibility with callers that still pass it; the value is ignored.
 */
export function getOrgTerms(_orgType?: OrgType | undefined) {
  void _orgType;
  return {
    singular: "Team",
    plural: "Teams",
    singularLower: "team",
    pluralLower: "teams",
  };
}
