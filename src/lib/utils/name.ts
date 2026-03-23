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
