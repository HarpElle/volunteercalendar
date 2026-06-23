/**
 * Parse a full name into first and last name.
 * Splits on the last space: "Mary Jane Watson" → { first_name: "Mary Jane", last_name: "Watson" }
 * Single-word names: "Prince" → { first_name: "Prince", last_name: "" }
 */
export function parseName(fullName: string): { first_name: string; last_name: string } {
  const trimmed = fullName.trim();
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace === -1) {
    return { first_name: trimmed, last_name: "" };
  }
  return {
    first_name: trimmed.slice(0, lastSpace),
    last_name: trimmed.slice(lastSpace + 1),
  };
}

/**
 * Get display initials from a name (up to 2 characters).
 * "Jason Paschall" → "JP", "Prince" → "P"
 */
export function formatInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Pull just the family surname out of a household-name-ish string.
 *
 * Handles the three real shapes we see:
 *   "Helen Pevensie"       → "Pevensie"   (legacy create flow stored full name)
 *   "The Pevensie Family"  → "Pevensie"   (formatted variant)
 *   "Pevensie"             → "Pevensie"   (clean post-fix create flow)
 *
 * Known limitation: surname particles ("Mary van der Berg") collapse to
 * the last token ("Berg"). Rare enough in the church-roster use case
 * that we accept the loss — the explicit `last_name` field on the
 * linked Person doc is the preferred source when available.
 *
 * Returns "" when nothing useful can be extracted; callers fall back
 * to "Family" / similar.
 */
export function extractSurname(raw: string): string {
  if (!raw) return "";
  const stripped = raw
    .replace(/^The\s+/i, "")
    .replace(/\s+Family$/i, "")
    .trim();
  if (!stripped) return "";
  const tokens = stripped.split(/\s+/);
  return tokens[tokens.length - 1];
}

/**
 * Display-format a household for listing surfaces (household list,
 * household detail header, Family Portal title, Apple Wallet FAMILY
 * field). Jason 2026-06-03 spec:
 *
 *   single guardian:        "Pevensie, Helen"
 *   same-surname couple:    "Pevensie, Helen & Roger"
 *   different surnames:     "Doe, John & Smith, Jane"
 *
 * Falls back to "Household" when both names are empty, and to the raw
 * first name when a guardian's name is single-token (no whitespace —
 * we can't recover a surname).
 */
export function formatHouseholdDisplay(input: {
  primary_guardian_name?: string | null;
  secondary_guardian_name?: string | null;
}): string {
  const p = (input.primary_guardian_name ?? "").trim();
  const s = (input.secondary_guardian_name ?? "").trim();

  if (!p && !s) return "Household";
  if (!p) return formatSingle(s);
  if (!s) return formatSingle(p);

  const pp = parseName(p);
  const sp = parseName(s);

  if (!pp.last_name && !sp.last_name) {
    // Both single-token — just join.
    return `${pp.first_name} & ${sp.first_name}`;
  }
  if (!pp.last_name) {
    // Primary single-token but secondary has surname — use secondary's
    // surname as the family anchor.
    return `${sp.last_name}, ${pp.first_name} & ${sp.first_name}`;
  }
  if (!sp.last_name || pp.last_name === sp.last_name) {
    // Same surname, or secondary single-token — combine under primary's surname.
    return `${pp.last_name}, ${pp.first_name} & ${sp.first_name}`;
  }
  // Different surnames — render each in full surname-first form.
  return `${pp.last_name}, ${pp.first_name} & ${sp.last_name}, ${sp.first_name}`;
}

function formatSingle(name: string): string {
  const { first_name, last_name } = parseName(name);
  if (!last_name) return first_name;
  return `${last_name}, ${first_name}`;
}
