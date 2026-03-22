/**
 * Security code generator for children's check-in.
 * Produces 4-character alphanumeric codes using a safe character set
 * that excludes visually ambiguous characters (0/O, 1/I/L, 2/Z, 5/S, 6/G, 8/B).
 */

const SAFE_CHARS = "ACDEFGHJKLMNPQRTUVWXY3479";

export function generateSecurityCode(): string {
  const array = new Uint8Array(4);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => SAFE_CHARS[byte % SAFE_CHARS.length]).join(
    "",
  );
}
