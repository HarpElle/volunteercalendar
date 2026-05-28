/**
 * Unit tests for the shared check-in window math.
 *
 * These lock in the fix for the Codex Wave 5 Batch E phase 3 Sev 2: the
 * SmartCheckInBanner showed a prompt that POST /api/check-in/self then
 * rejected with "Check-in window has closed", because the server parsed the
 * service start time in the runtime's local zone (UTC on Vercel) instead of
 * the church timezone. Both now call this module, so they always agree.
 */

import { describe, it, expect } from "vitest";
import {
  timeZoneOffsetMs,
  zonedDateTimeToEpochMs,
  dateStringInTimeZone,
  checkInWindowStatus,
} from "@/lib/utils/check-in-window";

const HOUR = 60 * 60 * 1000;

describe("timeZoneOffsetMs", () => {
  it("returns the EDT offset (-4h) for America/New_York in summer", () => {
    expect(timeZoneOffsetMs(Date.UTC(2026, 4, 28, 12, 0, 0), "America/New_York")).toBe(
      -4 * HOUR,
    );
  });

  it("returns the EST offset (-5h) for America/New_York in winter", () => {
    expect(timeZoneOffsetMs(Date.UTC(2026, 0, 15, 12, 0, 0), "America/New_York")).toBe(
      -5 * HOUR,
    );
  });

  it("returns a positive offset east of UTC (Australia/Sydney, AEST +10h)", () => {
    expect(timeZoneOffsetMs(Date.UTC(2026, 4, 28, 12, 0, 0), "Australia/Sydney")).toBe(
      10 * HOUR,
    );
  });

  it("treats UTC as zero offset", () => {
    expect(timeZoneOffsetMs(Date.UTC(2026, 4, 28, 12, 0, 0), "UTC")).toBe(0);
  });
});

describe("zonedDateTimeToEpochMs", () => {
  it("interprets 09:00 EDT as 13:00 UTC (the case the server got wrong)", () => {
    expect(zonedDateTimeToEpochMs("2026-05-28", "09:00", "America/New_York")).toBe(
      Date.UTC(2026, 4, 28, 13, 0, 0),
    );
  });

  it("interprets 09:00 EST as 14:00 UTC in winter (DST-aware)", () => {
    expect(zonedDateTimeToEpochMs("2026-01-15", "09:00", "America/New_York")).toBe(
      Date.UTC(2026, 0, 15, 14, 0, 0),
    );
  });

  it("interprets 09:00 AEST as the prior day 23:00 UTC (east of UTC)", () => {
    expect(zonedDateTimeToEpochMs("2026-05-28", "09:00", "Australia/Sydney")).toBe(
      Date.UTC(2026, 4, 27, 23, 0, 0),
    );
  });
});

describe("dateStringInTimeZone", () => {
  it("rolls back to the previous wall-clock day west of UTC", () => {
    // 02:00 UTC on the 28th is 22:00 EDT on the 27th.
    expect(dateStringInTimeZone("America/New_York", Date.UTC(2026, 4, 28, 2, 0, 0))).toBe(
      "2026-05-27",
    );
  });

  it("rolls forward to the next wall-clock day east of UTC", () => {
    // 16:00 UTC on the 28th is 02:00 AEST on the 29th.
    expect(dateStringInTimeZone("Australia/Sydney", Date.UTC(2026, 4, 28, 16, 0, 0))).toBe(
      "2026-05-29",
    );
  });
});

describe("checkInWindowStatus", () => {
  const base = {
    serviceDate: "2026-05-28",
    startTime: "09:00",
    timeZone: "America/New_York",
    windowBefore: 60,
    windowAfter: 30,
  };

  it("is OPEN 5 minutes after a same-timezone service start (the regression)", () => {
    // now = 09:05 EDT = 13:05 UTC. The OLD server logic computed the service
    // start as 09:00 UTC and got diff = 245 min → wrongly closed. The shared
    // helper computes the start as 13:00 UTC → diff = 5 min → open.
    const res = checkInWindowStatus({ ...base, nowMs: Date.UTC(2026, 4, 28, 13, 5, 0) });
    expect(res.open).toBe(true);
    expect(Math.round(res.diffMinutes)).toBe(5);
  });

  it("is OPEN at the early edge (exactly windowBefore minutes early)", () => {
    // 60 min before 09:00 EDT = 08:00 EDT = 12:00 UTC.
    const res = checkInWindowStatus({ ...base, nowMs: Date.UTC(2026, 4, 28, 12, 0, 0) });
    expect(res.open).toBe(true);
    expect(Math.round(res.diffMinutes)).toBe(-60);
  });

  it("is CLOSED before the early edge (61 minutes early)", () => {
    const res = checkInWindowStatus({ ...base, nowMs: Date.UTC(2026, 4, 28, 11, 59, 0) });
    expect(res.open).toBe(false);
  });

  it("is OPEN at the late edge (exactly windowAfter minutes late)", () => {
    // 30 min after 09:00 EDT = 09:30 EDT = 13:30 UTC.
    const res = checkInWindowStatus({ ...base, nowMs: Date.UTC(2026, 4, 28, 13, 30, 0) });
    expect(res.open).toBe(true);
    expect(Math.round(res.diffMinutes)).toBe(30);
  });

  it("is CLOSED past the late edge (31 minutes late)", () => {
    const res = checkInWindowStatus({ ...base, nowMs: Date.UTC(2026, 4, 28, 13, 31, 0) });
    expect(res.open).toBe(false);
  });
});
