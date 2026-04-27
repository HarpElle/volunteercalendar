import { describe, it, expect } from "vitest";
import { OUTBOX_DEFAULTS } from "@/lib/server/outbox";

describe("OUTBOX_DEFAULTS.computeNextAttemptAt", () => {
  it("returns ISO timestamp", () => {
    const r = OUTBOX_DEFAULTS.computeNextAttemptAt(1);
    expect(() => new Date(r)).not.toThrow();
    expect(r).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("schedules attempt 1 between 60 and 80 seconds in the future", () => {
    const before = Date.now();
    const r = OUTBOX_DEFAULTS.computeNextAttemptAt(1);
    const ms = new Date(r).getTime() - before;
    expect(ms).toBeGreaterThanOrEqual(60_000);
    expect(ms).toBeLessThan(75_000); // 60s base + max 12s jitter
  });

  it("schedules attempt 2 around 5 minutes out", () => {
    const before = Date.now();
    const r = OUTBOX_DEFAULTS.computeNextAttemptAt(2);
    const ms = new Date(r).getTime() - before;
    expect(ms).toBeGreaterThanOrEqual(300_000);
    expect(ms).toBeLessThan(360_000);
  });

  it("schedules attempt 3 around 30 minutes", () => {
    const before = Date.now();
    const r = OUTBOX_DEFAULTS.computeNextAttemptAt(3);
    const ms = new Date(r).getTime() - before;
    expect(ms).toBeGreaterThanOrEqual(1_800_000);
    expect(ms).toBeLessThan(2_500_000);
  });

  it("caps the backoff for attempts beyond the table", () => {
    const r1 = OUTBOX_DEFAULTS.computeNextAttemptAt(4);
    const r2 = OUTBOX_DEFAULTS.computeNextAttemptAt(99);
    const ms1 = new Date(r1).getTime() - Date.now();
    const ms2 = new Date(r2).getTime() - Date.now();
    // Both should be ~2hr (the max in the table)
    expect(ms1).toBeGreaterThanOrEqual(7_200_000);
    expect(ms2).toBeGreaterThanOrEqual(7_200_000);
  });

  it("MAX_ATTEMPTS is 5", () => {
    expect(OUTBOX_DEFAULTS.MAX_ATTEMPTS).toBe(5);
  });
});
