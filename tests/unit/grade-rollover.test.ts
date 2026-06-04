import { describe, expect, it } from "vitest";
import {
  nextGradeAfterRollover,
  shouldAdvanceChild,
  shouldRunRolloverForOrg,
} from "@/lib/server/grade-rollover";

describe("nextGradeAfterRollover", () => {
  it("returns null for unset / unknown grade", () => {
    expect(nextGradeAfterRollover(null)).toBeNull();
    expect(nextGradeAfterRollover("")).toBeNull();
    expect(nextGradeAfterRollover("13th")).toBeNull();
    expect(nextGradeAfterRollover(undefined)).toBeNull();
  });

  it("advances through the standard progression", () => {
    expect(nextGradeAfterRollover("nursery")).toBe("toddler");
    expect(nextGradeAfterRollover("toddler")).toBe("pre-k");
    expect(nextGradeAfterRollover("pre-k")).toBe("kindergarten");
    expect(nextGradeAfterRollover("kindergarten")).toBe("1st");
    expect(nextGradeAfterRollover("1st")).toBe("2nd");
    expect(nextGradeAfterRollover("2nd")).toBe("3rd");
    expect(nextGradeAfterRollover("3rd")).toBe("4th");
    expect(nextGradeAfterRollover("4th")).toBe("5th");
    expect(nextGradeAfterRollover("5th")).toBe("6th");
  });

  it("returns 'graduate' sentinel for 6th graders", () => {
    expect(nextGradeAfterRollover("6th")).toBe("graduate");
  });
});

describe("shouldRunRolloverForOrg", () => {
  it("never fires for manual or unset policy", () => {
    expect(shouldRunRolloverForOrg(undefined, new Date("2026-08-01T12:00:00Z"))).toBe(false);
    expect(shouldRunRolloverForOrg("manual", new Date("2026-08-01T12:00:00Z"))).toBe(false);
  });

  it("only fires on the 1st of the configured month", () => {
    expect(shouldRunRolloverForOrg("august", new Date("2026-08-01T12:00:00Z"))).toBe(true);
    expect(shouldRunRolloverForOrg("august", new Date("2026-08-02T12:00:00Z"))).toBe(false);
    expect(shouldRunRolloverForOrg("august", new Date("2026-08-31T12:00:00Z"))).toBe(false);
  });

  it("fires for the correct month only", () => {
    const aug1 = new Date("2026-08-01T12:00:00Z");
    expect(shouldRunRolloverForOrg("june", aug1)).toBe(false);
    expect(shouldRunRolloverForOrg("august", aug1)).toBe(true);
    expect(shouldRunRolloverForOrg("september", aug1)).toBe(false);

    const jun1 = new Date("2026-06-01T12:00:00Z");
    expect(shouldRunRolloverForOrg("june", jun1)).toBe(true);
    expect(shouldRunRolloverForOrg("august", jun1)).toBe(false);

    const sep1 = new Date("2026-09-01T12:00:00Z");
    expect(shouldRunRolloverForOrg("september", sep1)).toBe(true);
    expect(shouldRunRolloverForOrg("june", sep1)).toBe(false);
  });
});

describe("shouldAdvanceChild", () => {
  const now = new Date("2026-08-01T14:00:00Z");

  it("advances when no updated_at", () => {
    expect(shouldAdvanceChild({ updated_at: undefined, now })).toBe(true);
    expect(shouldAdvanceChild({ updated_at: null, now })).toBe(true);
  });

  it("advances when updated_at is malformed", () => {
    expect(shouldAdvanceChild({ updated_at: "not-a-date", now })).toBe(true);
  });

  it("skips when updated within the last 60 days", () => {
    // 30 days before now → skip
    const recent = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldAdvanceChild({ updated_at: recent, now })).toBe(false);

    // 59 days before → still skip
    const justUnder = new Date(now.getTime() - 59 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldAdvanceChild({ updated_at: justUnder, now })).toBe(false);
  });

  it("advances when updated 60+ days ago", () => {
    const old = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldAdvanceChild({ updated_at: old, now })).toBe(true);

    const veryOld = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldAdvanceChild({ updated_at: veryOld, now })).toBe(true);
  });
});
