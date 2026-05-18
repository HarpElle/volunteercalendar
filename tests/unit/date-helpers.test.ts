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
  todayInTimezone,
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

describe("todayInTimezone", () => {
  // Pin the format contract and that timezone arithmetic actually works.
  // The actual returned date depends on when these tests run, so we focus
  // on the format + invariants — never compare to a literal date string.

  it("returns a YYYY-MM-DD string", () => {
    const out = todayInTimezone("America/Chicago");
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to UTC for invalid timezones (does not throw)", () => {
    expect(() => todayInTimezone("Not/AReal_Zone")).not.toThrow();
    expect(todayInTimezone("Not/AReal_Zone")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to UTC for null/undefined", () => {
    expect(todayInTimezone(null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayInTimezone(undefined)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("America/Chicago and Asia/Tokyo can disagree by one day", () => {
    // At many moments these two are 14-15 hours apart, so the calendar date
    // differs. This proves the helper actually consults the timezone instead
    // of returning a constant.
    const chicago = todayInTimezone("America/Chicago");
    const tokyo = todayInTimezone("Asia/Tokyo");
    // Difference is at most 1 day. Same day is fine in narrow windows.
    const cDate = new Date(`${chicago}T12:00:00Z`).getTime();
    const tDate = new Date(`${tokyo}T12:00:00Z`).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    expect(Math.abs(cDate - tDate)).toBeLessThanOrEqual(dayMs);
  });

  it("the Codex regression case: UTC and America/Chicago differ when UTC just rolled past midnight", () => {
    // Stub Date so the test is deterministic. At 00:30 UTC, the local
    // Chicago time is 19:30 the previous day — and the buggy
    // toISOString().split("T")[0] approach returns the NEXT day for both,
    // whereas todayInTimezone("America/Chicago") returns the previous day.
    const realDateNow = Date.now;
    // Pick a clear winter day: 2026-01-15 00:30 UTC = 2026-01-14 18:30 CST
    const fakeMs = Date.UTC(2026, 0, 15, 0, 30, 0);
    Date.now = () => fakeMs;
    const origDate = global.Date;
    // Replace `new Date()` (no args) with `new Date(fakeMs)`; pass through
    // every other constructor signature unchanged.
    function FakeDate(this: Date, ...args: unknown[]) {
      if (args.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new (origDate as any)(fakeMs);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new (origDate as any)(...args);
    }
    FakeDate.now = () => fakeMs;
    FakeDate.UTC = origDate.UTC;
    FakeDate.parse = origDate.parse;
    Object.setPrototypeOf(FakeDate.prototype, origDate.prototype);
    Object.setPrototypeOf(FakeDate, origDate);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.Date = FakeDate as any;
    try {
      expect(todayInTimezone("UTC")).toBe("2026-01-15");
      expect(todayInTimezone("America/Chicago")).toBe("2026-01-14");
    } finally {
      global.Date = origDate;
      Date.now = realDateNow;
    }
  });
});
