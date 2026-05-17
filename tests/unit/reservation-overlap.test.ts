/**
 * Tests for the reservation overlap contract used by the POST + PUT
 * /api/reservations endpoints.
 *
 * Pins the bug Codex flagged in Phase 5 retest: a one-time booking that
 * landed inside an existing recurring occurrence was silently routed to
 * `pending_approval` instead of returning 409 with conflicts to the modal.
 * The booking modal expected `!res.ok && json.conflicts`, so the silent
 * pending_approval path let overlapping reservations persist without the
 * user ever seeing a conflict prompt.
 *
 * The overlap predicate itself is an open-interval check:
 *     A_start < B_end && B_start < A_end
 *
 * Back-to-back bookings (one ends exactly when the next starts) do NOT
 * conflict.
 */

import { describe, it, expect } from "vitest";
import { intervalsOverlap } from "@/app/api/reservations/route";

describe("intervalsOverlap", () => {
  it("flags Codex's blocker: 19:30–20:00 inside 19:00–21:00", () => {
    expect(intervalsOverlap("19:30", "20:00", "19:00", "21:00")).toBe(true);
  });

  it("flags identical windows", () => {
    expect(intervalsOverlap("10:00", "11:00", "10:00", "11:00")).toBe(true);
  });

  it("flags A starting inside B", () => {
    expect(intervalsOverlap("10:30", "12:00", "10:00", "11:00")).toBe(true);
  });

  it("flags A ending inside B", () => {
    expect(intervalsOverlap("09:00", "10:30", "10:00", "11:00")).toBe(true);
  });

  it("flags A fully containing B", () => {
    expect(intervalsOverlap("09:00", "12:00", "10:00", "11:00")).toBe(true);
  });

  it("flags B fully containing A", () => {
    expect(intervalsOverlap("10:15", "10:45", "10:00", "11:00")).toBe(true);
  });

  it("does NOT flag back-to-back bookings (open intervals)", () => {
    // Acceptable for setup/teardown chains: one event ends exactly when
    // the next starts.
    expect(intervalsOverlap("10:00", "11:00", "11:00", "12:00")).toBe(false);
    expect(intervalsOverlap("11:00", "12:00", "10:00", "11:00")).toBe(false);
  });

  it("does NOT flag fully-separated windows", () => {
    expect(intervalsOverlap("10:00", "10:30", "11:00", "12:00")).toBe(false);
    expect(intervalsOverlap("13:00", "14:00", "10:00", "11:00")).toBe(false);
  });

  it("does NOT flag a single-minute gap", () => {
    expect(intervalsOverlap("10:00", "10:59", "11:00", "12:00")).toBe(false);
  });

  it("is symmetric (swap of A and B produces the same answer)", () => {
    // Quick exhaustive-ish check across a handful of pairs.
    const cases: [string, string, string, string][] = [
      ["19:30", "20:00", "19:00", "21:00"],
      ["10:00", "11:00", "11:00", "12:00"],
      ["10:00", "10:30", "11:00", "12:00"],
      ["09:00", "12:00", "10:00", "11:00"],
    ];
    for (const [a1, a2, b1, b2] of cases) {
      expect(intervalsOverlap(a1, a2, b1, b2)).toBe(
        intervalsOverlap(b1, b2, a1, a2),
      );
    }
  });
});
