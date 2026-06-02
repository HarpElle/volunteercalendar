/**
 * Wave 12 C — pins shouldEscalateSwap() behavior.
 *
 * The daily cron sweeps every open swap_request across the platform.
 * If this predicate drifts, we either spam scheduler inboxes (every
 * day, forever) or never escalate at all and let day-of crises
 * blindside the church. Both failure modes cause real-world pain;
 * both are caught by these tests.
 */

import { describe, it, expect } from "vitest";
import type { SwapRequest } from "@/lib/types";
import {
  shouldEscalateSwap,
  addOneDayIso,
} from "@/lib/server/swap-escalation";

const TODAY = "2026-06-02";
const TOMORROW = "2026-06-03";

// Helper — minimal valid swap shape for the predicate. The predicate
// only reads the three fields it cares about, so we don't need to
// stub the rest.
function swap(
  overrides: Partial<
    Pick<SwapRequest, "status" | "service_date" | "escalated_at">
  >,
): Pick<SwapRequest, "status" | "service_date" | "escalated_at"> {
  return {
    status: "open",
    service_date: TOMORROW,
    escalated_at: null,
    ...overrides,
  };
}

describe("shouldEscalateSwap", () => {
  describe("date window", () => {
    it("escalates when service is tomorrow", () => {
      expect(
        shouldEscalateSwap({
          swap: swap({ service_date: TOMORROW }),
          todayIso: TODAY,
          tomorrowIso: TOMORROW,
        }),
      ).toBe(true);
    });

    it("escalates when service is today (catches late requests)", () => {
      expect(
        shouldEscalateSwap({
          swap: swap({ service_date: TODAY }),
          todayIso: TODAY,
          tomorrowIso: TOMORROW,
        }),
      ).toBe(true);
    });

    it("does NOT escalate when service is in 2+ days (runway remains)", () => {
      expect(
        shouldEscalateSwap({
          swap: swap({ service_date: "2026-06-15" }),
          todayIso: TODAY,
          tomorrowIso: TOMORROW,
        }),
      ).toBe(false);
    });

    it("does NOT escalate when service is in the past", () => {
      expect(
        shouldEscalateSwap({
          swap: swap({ service_date: "2026-05-01" }),
          todayIso: TODAY,
          tomorrowIso: TOMORROW,
        }),
      ).toBe(false);
    });
  });

  describe("status gate", () => {
    it("does NOT escalate auto_approved swaps (already covered)", () => {
      expect(
        shouldEscalateSwap({
          swap: swap({ status: "auto_approved" }),
          todayIso: TODAY,
          tomorrowIso: TOMORROW,
        }),
      ).toBe(false);
    });

    it("does NOT escalate approved swaps", () => {
      expect(
        shouldEscalateSwap({
          swap: swap({ status: "approved" }),
          todayIso: TODAY,
          tomorrowIso: TOMORROW,
        }),
      ).toBe(false);
    });

    it("does NOT escalate cancelled swaps", () => {
      expect(
        shouldEscalateSwap({
          swap: swap({ status: "cancelled" }),
          todayIso: TODAY,
          tomorrowIso: TOMORROW,
        }),
      ).toBe(false);
    });

    it("does NOT escalate pending_admin swaps (already in human hands)", () => {
      expect(
        shouldEscalateSwap({
          swap: swap({ status: "pending_admin" }),
          todayIso: TODAY,
          tomorrowIso: TOMORROW,
        }),
      ).toBe(false);
    });
  });

  describe("once-only rule — the spam guard", () => {
    it("does NOT escalate a swap that was already escalated", () => {
      // THE regression that would cause scheduler inboxes to fill
      // with daily duplicates. If this test breaks, prod will too.
      expect(
        shouldEscalateSwap({
          swap: swap({ escalated_at: "2026-06-01T12:00:00.000Z" }),
          todayIso: TODAY,
          tomorrowIso: TOMORROW,
        }),
      ).toBe(false);
    });

    it("treats undefined escalated_at as never-escalated (legacy docs)", () => {
      // Older swap docs created before W12-C may lack the field.
      // Should still be escalatable when the date is right.
      expect(
        shouldEscalateSwap({
          // Cast — the field is required on the test helper, but in
          // Firestore it's optional and may be absent.
          swap: { status: "open", service_date: TOMORROW, escalated_at: undefined as unknown as null },
          todayIso: TODAY,
          tomorrowIso: TOMORROW,
        }),
      ).toBe(true);
    });
  });
});

describe("addOneDayIso", () => {
  it("advances by one calendar day", () => {
    expect(addOneDayIso("2026-06-02")).toBe("2026-06-03");
  });

  it("handles month boundaries", () => {
    expect(addOneDayIso("2026-06-30")).toBe("2026-07-01");
  });

  it("handles year boundaries", () => {
    expect(addOneDayIso("2026-12-31")).toBe("2027-01-01");
  });

  it("handles leap day → March 1 in leap year", () => {
    expect(addOneDayIso("2028-02-29")).toBe("2028-03-01");
  });

  it("handles Feb 28 → Mar 1 in NON-leap year", () => {
    expect(addOneDayIso("2026-02-28")).toBe("2026-03-01");
  });
});
