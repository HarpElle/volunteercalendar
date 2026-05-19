/**
 * Pure regression for the availability-banner auto-clear rule shipped
 * in PR #40 polish.
 *
 * Before: /dashboard/my-schedule rendered every unread
 * `availability_request` notification as a banner, including ones whose
 * `metadata.due_date` was in the past. Volunteers saw stale calls-to-
 * action that had no live consequence.
 *
 * After: the render-time filter skips notifications whose `due_date <
 * today`. The notification itself stays in the user_notifications
 * collection for inbox history.
 */

import { describe, it, expect } from "vitest";

// Mirror the filter expression used inline at the banner render site
// (src/app/dashboard/my-schedule/page.tsx). Keeping the predicate as a
// helper lets us assert it directly without standing up jsdom.
function isAvailabilityBannerActive(
  notif: { metadata?: { due_date?: string } | null },
  today: string,
): boolean {
  const dueDate = notif.metadata?.due_date;
  if (!dueDate) return true;
  return dueDate >= today;
}

const TODAY = "2026-05-18";

describe("isAvailabilityBannerActive", () => {
  it("shows banners with no due_date (no deadline → always visible)", () => {
    expect(isAvailabilityBannerActive({}, TODAY)).toBe(true);
    expect(isAvailabilityBannerActive({ metadata: {} }, TODAY)).toBe(true);
    expect(isAvailabilityBannerActive({ metadata: null }, TODAY)).toBe(true);
  });

  it("shows banners with a future due_date", () => {
    expect(
      isAvailabilityBannerActive({ metadata: { due_date: "2026-05-25" } }, TODAY),
    ).toBe(true);
    expect(
      isAvailabilityBannerActive({ metadata: { due_date: "2027-01-01" } }, TODAY),
    ).toBe(true);
  });

  it("shows banners due TODAY (the volunteer still has the rest of the day)", () => {
    expect(
      isAvailabilityBannerActive({ metadata: { due_date: TODAY } }, TODAY),
    ).toBe(true);
  });

  it("HIDES banners whose due_date has already passed", () => {
    expect(
      isAvailabilityBannerActive({ metadata: { due_date: "2026-05-17" } }, TODAY),
    ).toBe(false);
    expect(
      isAvailabilityBannerActive({ metadata: { due_date: "2025-12-31" } }, TODAY),
    ).toBe(false);
  });

  it("string comparison is correct across month + year boundaries (ISO YYYY-MM-DD)", () => {
    expect(
      isAvailabilityBannerActive({ metadata: { due_date: "2026-04-30" } }, "2026-05-01"),
    ).toBe(false);
    expect(
      isAvailabilityBannerActive({ metadata: { due_date: "2027-01-01" } }, "2026-12-31"),
    ).toBe(true);
  });
});
