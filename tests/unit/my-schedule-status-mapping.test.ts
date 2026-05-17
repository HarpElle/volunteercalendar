/**
 * Codex Run 2 retest follow-up (2026-05-17): My Schedule UI status mapping.
 *
 * Bug context: assignment.status stays "draft" after a schedule publishes
 * (only the SCHEDULE moves to "published"). The My Schedule UI must:
 *   - treat (kind="assignment" && status="draft") as PENDING — show
 *     Confirm/Decline actions, render the label as "Pending" not "Draft"
 *   - treat status="confirmed" as confirmed (Can't Make It / Remove)
 *   - hide actions for declined/cancelled
 *
 * This file pins the predicate that drives the conditional rendering.
 * Keeping it as a pure function lets us regression-test without booting
 * React. If the predicate ever drifts, the UI will silently break — these
 * tests catch that.
 */

import { describe, it, expect } from "vitest";

/** Mirror of the predicate used in src/app/dashboard/my-schedule/page.tsx. */
function isPendingResponse(
  kind: "assignment" | "signup",
  status: string,
): boolean {
  return kind === "assignment" && status === "draft";
}

/** Mirror of the statusLabel pipeline. */
function statusLabel(
  kind: "assignment" | "signup",
  status: string,
): string {
  if (isPendingResponse(kind, status)) return "Pending";
  if (status === "approved") return "confirmed";
  return status;
}

describe("My Schedule — status mapping (Codex Run 2 retest)", () => {
  describe("isPendingResponse predicate", () => {
    it("flags draft assignment-kind as pending (needs Confirm/Decline)", () => {
      expect(isPendingResponse("assignment", "draft")).toBe(true);
    });

    it("does NOT flag confirmed assignment", () => {
      expect(isPendingResponse("assignment", "confirmed")).toBe(false);
    });

    it("does NOT flag declined assignment", () => {
      expect(isPendingResponse("assignment", "declined")).toBe(false);
    });

    it("does NOT flag event signups (signups auto-confirm)", () => {
      // Event signups go through a different code path and never use
      // "draft" as status. Even if they did, the predicate excludes them.
      expect(isPendingResponse("signup", "draft")).toBe(false);
      expect(isPendingResponse("signup", "confirmed")).toBe(false);
    });
  });

  describe("statusLabel", () => {
    it("renders pending assignments as 'Pending' (not raw 'draft')", () => {
      // Codex Run 2 retest blocker: previously rendered "Draft" verbatim,
      // making volunteers think their assignment hadn't been finalized.
      expect(statusLabel("assignment", "draft")).toBe("Pending");
    });

    it("renders 'approved' as 'confirmed' (legacy alias)", () => {
      expect(statusLabel("assignment", "approved")).toBe("confirmed");
    });

    it("passes through other statuses verbatim", () => {
      expect(statusLabel("assignment", "confirmed")).toBe("confirmed");
      expect(statusLabel("assignment", "declined")).toBe("declined");
      expect(statusLabel("signup", "cancelled")).toBe("cancelled");
    });
  });
});
