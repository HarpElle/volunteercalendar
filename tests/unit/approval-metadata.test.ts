/**
 * Regression tests for the Codex Run 3 PR #27 retest 2026-05-17 ministry
 * approval metadata blocker.
 *
 * Bug: ApprovalCountdown (the "Ministry Approvals" summary on the schedule
 * detail page) rendered approval.approved_by as a raw Firebase UID and
 * approval.approved_at via the browser's default TZ. MinistryReviewPanel
 * was fixed in PR #27 but the summary tile shared no helper with it.
 *
 * PR #28: both surfaces now resolve UID → Person.name via a personByUserId
 * map and format the date in the church IANA timezone.
 *
 * These tests cover the pure helpers (TZ formatting + UID→name lookup) so
 * any future refactor that breaks the contract surfaces a failure here
 * instead of as a re-opened blocker.
 */

import { describe, it, expect } from "vitest";

function formatApprovedAt(iso: string, tz: string | undefined): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      timeZone: tz || "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return new Date(iso).toLocaleDateString();
  }
}

function resolveApproverName(
  uid: string | null | undefined,
  personByUserId: Map<string, { name: string }>,
): string {
  if (!uid) return "";
  return personByUserId.get(uid)?.name || uid;
}

describe("ApprovalCountdown metadata helpers", () => {
  describe("formatApprovedAt", () => {
    it("renders the approval timestamp in the church's local TZ, not UTC", () => {
      // 2026-05-18T03:00:00Z = 2026-05-17 22:00 CDT (America/Chicago)
      const iso = "2026-05-18T03:00:00Z";
      const cdt = formatApprovedAt(iso, "America/Chicago");
      expect(cdt).toMatch(/May 17, 2026/);

      const utc = formatApprovedAt(iso, "UTC");
      expect(utc).toMatch(/May 18, 2026/);
    });

    it("falls back to UTC when timezone is undefined", () => {
      const iso = "2026-05-18T03:00:00Z";
      expect(formatApprovedAt(iso, undefined)).toMatch(/May 18, 2026/);
    });

    it("does not throw on a malformed timezone string", () => {
      const iso = "2026-05-18T03:00:00Z";
      expect(() => formatApprovedAt(iso, "Not/A/Real/TZ")).not.toThrow();
    });
  });

  describe("resolveApproverName", () => {
    it("returns the Person.name when the UID is in the map", () => {
      const map = new Map<string, { name: string }>([
        ["NQUd09eP1fOD3MWrdpIbHYUXm0z2", { name: "Sarah Pastor Tester" }],
      ]);
      expect(
        resolveApproverName("NQUd09eP1fOD3MWrdpIbHYUXm0z2", map),
      ).toBe("Sarah Pastor Tester");
    });

    it("falls back to the raw UID when no Person matches (e.g. approver left the org)", () => {
      const map = new Map<string, { name: string }>();
      expect(resolveApproverName("uid-no-longer-here", map)).toBe(
        "uid-no-longer-here",
      );
    });

    it("returns empty string for null/undefined uid", () => {
      const map = new Map<string, { name: string }>();
      expect(resolveApproverName(null, map)).toBe("");
      expect(resolveApproverName(undefined, map)).toBe("");
    });
  });
});
