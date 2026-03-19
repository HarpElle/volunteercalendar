/**
 * Format a raw phone string for display.
 * Handles 10-digit US numbers and 11-digit with leading 1.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "\u2014";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === "1") return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return raw;
}

/**
 * Format phone for display in an input field (returns empty string instead of em dash for empty values).
 */
export function formatPhoneInput(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === "1") return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return raw;
}

/**
 * Normalize a phone string to digits only, stripping leading US country code.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") return digits.slice(1);
  return digits;
}
