/**
 * Codex Phase 6 2026-05-18 regression: the prerequisite UI now exposes
 * `expires_in_days` and the journey writer translates that into a per-
 * volunteer `expires_at`. This pins the math so a Background Check with
 * 365-day expiry consistently lands a year from completion regardless of
 * DST or month-boundary edge cases.
 */

import { describe, it, expect } from "vitest";

function computeExpiresAt(
  completedAtIso: string,
  expiresInDays: number | null | undefined,
): string | null {
  if (!expiresInDays || expiresInDays <= 0) return null;
  return new Date(
    Date.parse(completedAtIso) + expiresInDays * 86400000,
  ).toISOString();
}

describe("computeExpiresAt — prerequisite step expiration math", () => {
  it("returns null when expires_in_days is missing or zero", () => {
    expect(computeExpiresAt("2026-05-18T15:00:00Z", null)).toBe(null);
    expect(computeExpiresAt("2026-05-18T15:00:00Z", undefined)).toBe(null);
    expect(computeExpiresAt("2026-05-18T15:00:00Z", 0)).toBe(null);
  });

  it("returns null for negative day counts (defensive)", () => {
    expect(computeExpiresAt("2026-05-18T15:00:00Z", -5)).toBe(null);
  });

  it("adds 365 days to the completion timestamp for a typical background check", () => {
    const completed = "2026-05-18T15:00:00.000Z";
    const expires = computeExpiresAt(completed, 365);
    expect(expires).toBe("2027-05-18T15:00:00.000Z");
  });

  it("adds 30 days for a shorter cert", () => {
    const completed = "2026-05-18T15:00:00.000Z";
    expect(computeExpiresAt(completed, 30)).toBe("2026-06-17T15:00:00.000Z");
  });

  it("crosses a year boundary cleanly", () => {
    const completed = "2026-12-31T23:00:00.000Z";
    expect(computeExpiresAt(completed, 365)).toBe("2027-12-31T23:00:00.000Z");
  });

  it("crosses February with day arithmetic, not month arithmetic", () => {
    // Day math: 2026-02-15 + 14 = 2026-03-01 (2026 is non-leap; Feb has 28 days)
    const completed = "2026-02-15T12:00:00.000Z";
    expect(computeExpiresAt(completed, 14)).toBe("2026-03-01T12:00:00.000Z");
  });
});
