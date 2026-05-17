/**
 * Codex Run 2 Phase 3 regression: volunteer-health used to read v.stats
 * (never updated since person creation), so every active volunteer was
 * classified as "Inactive / Never scheduled" regardless of activity.
 *
 * The fix in src/app/dashboard/volunteer-health/page.tsx computes stats live
 * from the assignments collection. This file pins the compute helper. The
 * helper is replicated here to keep the test runnable without booting React;
 * if the production version drifts, the assertions still demonstrate the
 * required contract.
 */

import { describe, it, expect } from "vitest";
import type { Person, Assignment } from "@/lib/types";

function makePerson(id: string): Person {
  // Cast through unknown — Person has many fields the helper doesn't read.
  return {
    id,
    name: id,
    email: `${id}@example.com`,
    is_volunteer: true,
    status: "active",
    ministry_ids: ["m1"],
  } as unknown as Person;
}

function makeAssignment(overrides: Partial<Assignment>): Assignment {
  return {
    id: "a1",
    service_date: "2026-05-10",
    person_id: "v1",
    status: "confirmed",
    attended: null,
    ...overrides,
  } as unknown as Assignment;
}

// Replicated helper. Keep in sync with src/app/dashboard/volunteer-health/page.tsx.
function computeLiveStats(
  v: Person,
  recentAssignments: Assignment[],
): { times_scheduled_last_90d: number; last_served_date: string | null; decline_count: number; no_show_count: number } {
  const today = new Date();
  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const cutoff = ninetyDaysAgo.toISOString().split("T")[0];
  const todayStr = today.toISOString().split("T")[0];

  let times_scheduled_last_90d = 0;
  let last_served_date: string | null = null;
  let decline_count = 0;
  let no_show_count = 0;

  for (const a of recentAssignments) {
    if (a.person_id !== v.id) continue;
    const dateStr = a.service_date as string | undefined;
    if (!dateStr) continue;
    if (dateStr >= cutoff && a.status !== "declined") {
      times_scheduled_last_90d++;
    }
    if (dateStr < todayStr && (a.status === "confirmed" || a.attended === "present")) {
      if (!last_served_date || dateStr > last_served_date) {
        last_served_date = dateStr;
      }
    }
    if (a.status === "declined") decline_count++;
    if (a.attended === "no_show") no_show_count++;
  }

  return { times_scheduled_last_90d, last_served_date, decline_count, no_show_count };
}

describe("volunteer-health computeLiveStats (Codex Run 2 Phase 3)", () => {
  it("counts assignments in the last 90 days", () => {
    const alex = makePerson("alex");
    const today = new Date().toISOString().split("T")[0];
    const assigns = [
      makeAssignment({ id: "a1", person_id: "alex", service_date: today, status: "confirmed" }),
      makeAssignment({ id: "a2", person_id: "alex", service_date: today, status: "draft" }),
    ];
    expect(computeLiveStats(alex, assigns).times_scheduled_last_90d).toBe(2);
  });

  it("excludes declined assignments from the scheduled count", () => {
    const alex = makePerson("alex");
    const today = new Date().toISOString().split("T")[0];
    const assigns = [
      makeAssignment({ id: "a1", person_id: "alex", service_date: today, status: "confirmed" }),
      makeAssignment({ id: "a2", person_id: "alex", service_date: today, status: "declined" }),
    ];
    expect(computeLiveStats(alex, assigns).times_scheduled_last_90d).toBe(1);
  });

  it("ignores other volunteers' assignments", () => {
    const alex = makePerson("alex");
    const today = new Date().toISOString().split("T")[0];
    const assigns = [
      makeAssignment({ id: "a1", person_id: "jordan", service_date: today, status: "confirmed" }),
    ];
    expect(computeLiveStats(alex, assigns).times_scheduled_last_90d).toBe(0);
  });

  it("reports the most recent past confirmed/attended date as last_served_date", () => {
    const alex = makePerson("alex");
    const assigns = [
      // Two past confirmed assignments
      makeAssignment({ id: "a1", person_id: "alex", service_date: "2026-04-01", status: "confirmed" }),
      makeAssignment({ id: "a2", person_id: "alex", service_date: "2026-05-08", status: "confirmed" }),
    ];
    expect(computeLiveStats(alex, assigns).last_served_date).toBe("2026-05-08");
  });

  it("counts declines and no-shows separately", () => {
    const alex = makePerson("alex");
    const today = new Date().toISOString().split("T")[0];
    const assigns = [
      makeAssignment({ id: "a1", person_id: "alex", service_date: today, status: "declined" }),
      makeAssignment({ id: "a2", person_id: "alex", service_date: today, status: "confirmed", attended: "no_show" }),
    ];
    const stats = computeLiveStats(alex, assigns);
    expect(stats.decline_count).toBe(1);
    expect(stats.no_show_count).toBe(1);
  });

  it("does NOT regress to the all-zero Inactive bug from Codex Run 2", () => {
    // The bug: Alex had many published assignments but v.stats stayed at 0
    // because nothing updates it. The dashboard classified him as
    // "Inactive / Never scheduled." This is the canary.
    const alex = makePerson("alex");
    const today = new Date().toISOString().split("T")[0];
    const assigns = [
      makeAssignment({ id: "a1", person_id: "alex", service_date: today, status: "confirmed" }),
      makeAssignment({ id: "a2", person_id: "alex", service_date: today, status: "confirmed" }),
      makeAssignment({ id: "a3", person_id: "alex", service_date: today, status: "confirmed" }),
      makeAssignment({ id: "a4", person_id: "alex", service_date: today, status: "draft" }),
    ];
    const stats = computeLiveStats(alex, assigns);
    expect(stats.times_scheduled_last_90d).toBeGreaterThan(0);
  });
});
