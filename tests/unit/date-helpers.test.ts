/**
 * Tests for src/lib/utils/date.ts.
 *
 * Pins the off-by-one fix from PR #10's retest feedback: when a user picked
 * `2026-05-24` in the New Plan modal, the editor displayed `Saturday, May 23,
 * 2026` because `new Date("2026-05-24")` parses as UTC midnight, then renders
 * the previous day in US local timezones.
 *
 * formatLocalDate anchors the YYYY-MM-DD string to noon local time, which sits
 * inside the same calendar day for every US timezone.
 */

import { describe, it, expect } from "vitest";
import {
  formatLocalDate,
  formatLocalDateLong,
  formatLocalDateShort,
} from "@/lib/utils/date";

describe("formatLocalDate", () => {
  it("returns empty string for null/undefined/empty input", () => {
    expect(formatLocalDate(null)).toBe("");
    expect(formatLocalDate(undefined)).toBe("");
    expect(formatLocalDate("")).toBe("");
  });

  it("renders 2026-05-24 as a Sunday (the calendar day picked), not Saturday", () => {
    // The off-by-one bug we are fixing: `new Date("2026-05-24")` is UTC
    // midnight, which in US local timezones renders as the prior Saturday.
    const out = formatLocalDateLong("2026-05-24");
    expect(out).toContain("Sunday");
    expect(out).toContain("24");
    expect(out).not.toContain("Saturday");
    expect(out).not.toContain("23");
  });

  it("renders 2026-01-01 as a Thursday (the calendar day picked)", () => {
    // Year-boundary regression: 2026-01-01 in UTC could render as 2025-12-31
    // in negative-offset local zones with the buggy parser.
    const out = formatLocalDateLong("2026-01-01");
    expect(out).toContain("Thursday");
    expect(out).toContain("January");
    expect(out).toContain("2026");
  });

  it("strips a time portion if one was accidentally passed", () => {
    // Robustness: even if a caller passes an ISO timestamp, we want the
    // calendar-date part interpreted in local time.
    const out = formatLocalDateLong("2026-05-24T00:00:00.000Z");
    expect(out).toContain("Sunday");
    expect(out).toContain("24");
  });
});

describe("formatLocalDateLong", () => {
  it("includes weekday, full month, day, and year", () => {
    const out = formatLocalDateLong("2026-05-24");
    expect(out).toMatch(/Sunday/);
    expect(out).toMatch(/May/);
    expect(out).toMatch(/24/);
    expect(out).toMatch(/2026/);
  });
});

describe("formatLocalDateShort", () => {
  it("includes short weekday, short month, and day", () => {
    const out = formatLocalDateShort("2026-05-24");
    expect(out).toMatch(/Sun/);
    expect(out).toMatch(/May/);
    expect(out).toMatch(/24/);
  });
});
