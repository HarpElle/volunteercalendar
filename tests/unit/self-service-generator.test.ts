/**
 * Regression tests for the Codex Run 3 PR #27 retest 2026-05-17 Self-Service
 * blocker.
 *
 * Bug 1: When workflow_mode = "self-service" was passed to
 * generateDraftSchedule, it should produce ZERO assignments and emit one
 * `unfilled_role` conflict per slot. Previously the generator ignored
 * workflow_mode and auto-assigned. PR #27 added the skip; this test
 * locks in that contract so the slots aren't silently re-introduced.
 *
 * Bug 2: The UI now renders those unfilled slots via
 * <SelfServiceOpenSlots>, which calls generateOccurrences directly. This
 * test also covers that helper's contract for date-range expansion since
 * the UI depends on it.
 */

import { describe, it, expect } from "vitest";
import {
  generateDraftSchedule,
  generateOccurrences,
  normalizeWorkflowMode,
} from "@/lib/services/scheduler";
import type { Person, Service, Household, Ministry } from "@/lib/types";

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: "svc1",
    church_id: "c1",
    name: "Sunday Worship",
    ministry_id: "worship",
    ministries: null,
    day_of_week: 0, // Sunday
    start_time: "10:00",
    end_time: "11:30",
    recurrence: "weekly",
    roles: [
      { role_id: "vocals", title: "Vocalist", count: 2 },
      { role_id: "guitar", title: "Guitarist", count: 1 },
    ],
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Service;
}

function makeVolunteer(overrides: Partial<Person> = {}): Person {
  return {
    id: "p1",
    name: "Volunteer One",
    email: "v1@example.com",
    phone: null,
    photo_url: null,
    church_id: "c1",
    user_id: "uid1",
    person_type: "volunteer",
    is_volunteer: true,
    status: "active",
    ministry_ids: ["worship"],
    role_ids: ["vocals", "guitar"],
    campus_ids: [],
    household_ids: [],
    notes: null,
    scheduling_profile: null,
    child_profile: null,
    stats: null,
    imported_from: "manual",
    background_check: null,
    role_constraints: null,
    volunteer_journey: null,
    qr_token: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Person;
}

const SUNDAY_2026_09_06 = "2026-09-06";
const SATURDAY_2026_09_12 = "2026-09-12";

describe("generateDraftSchedule — Self-Service workflow", () => {
  it("produces ZERO assignments even when eligible volunteers exist", () => {
    const services = [makeService()];
    const volunteers = [
      makeVolunteer({ id: "p1", name: "V1" }),
      makeVolunteer({ id: "p2", name: "V2", user_id: "uid2" }),
      makeVolunteer({ id: "p3", name: "V3", user_id: "uid3" }),
    ];
    const result = generateDraftSchedule(
      "sched1",
      "c1",
      services,
      volunteers,
      [] as Household[],
      SUNDAY_2026_09_06,
      SATURDAY_2026_09_12,
      [] as Ministry[],
      [],
      "self-service",
    );

    expect(result.assignments).toEqual([]);
    expect(result.stats.filled_slots).toBe(0);
    expect(result.stats.unique_volunteers).toBe(0);
  });

  it("emits an unfilled_role conflict per role slot (one per claim opportunity)", () => {
    const services = [makeService()]; // 2 vocals + 1 guitar = 3 slots/week
    const volunteers = [makeVolunteer()];
    const result = generateDraftSchedule(
      "sched1",
      "c1",
      services,
      volunteers,
      [],
      SUNDAY_2026_09_06,
      SATURDAY_2026_09_12,
      [],
      [],
      "self-service",
    );

    // 1 weekly occurrence × 3 slots = 3 unfilled conflicts
    const unfilled = result.conflicts.filter((c) => c.type === "unfilled_role");
    expect(unfilled).toHaveLength(3);
    expect(result.stats.total_slots).toBe(3);
    expect(result.stats.unfilled_slots).toBe(3);
    expect(result.stats.fill_rate).toBe(0);
  });

  it("Centralized regression: still auto-assigns when workflow_mode is omitted or 'centralized'", () => {
    const services = [makeService({ roles: [{ role_id: "vocals", title: "Vocalist", count: 1 }] })];
    const volunteers = [makeVolunteer()];

    const omitted = generateDraftSchedule(
      "sched1",
      "c1",
      services,
      volunteers,
      [],
      SUNDAY_2026_09_06,
      SATURDAY_2026_09_12,
      [],
      [],
      // no workflowMode arg
    );
    expect(omitted.assignments.length).toBe(1);

    const centralized = generateDraftSchedule(
      "sched2",
      "c1",
      services,
      volunteers,
      [],
      SUNDAY_2026_09_06,
      SATURDAY_2026_09_12,
      [],
      [],
      "centralized",
    );
    expect(centralized.assignments.length).toBe(1);
  });
});

describe("normalizeWorkflowMode — Codex PR #28 retest 2026-05-17", () => {
  // PR #28 ran a strict `=== "self-service"` check; the existing 2026-09-07
  // draft missed it and fell into the empty state even though Firestore
  // visibly stored `"self-service"`. This helper guarantees any variant
  // collapses to the canonical form.

  it("returns the canonical value when input already matches", () => {
    expect(normalizeWorkflowMode("self-service")).toBe("self-service");
    expect(normalizeWorkflowMode("centralized")).toBe("centralized");
    expect(normalizeWorkflowMode("ministry-first")).toBe("ministry-first");
    expect(normalizeWorkflowMode("hybrid")).toBe("hybrid");
  });

  it("tolerates underscore variants (self_service)", () => {
    expect(normalizeWorkflowMode("self_service")).toBe("self-service");
  });

  it("tolerates whitespace variants (display value bleeding back)", () => {
    expect(normalizeWorkflowMode("self service")).toBe("self-service");
    expect(normalizeWorkflowMode("ministry first")).toBe("ministry-first");
    expect(normalizeWorkflowMode("  self-service  ")).toBe("self-service");
  });

  it("tolerates casing variants", () => {
    expect(normalizeWorkflowMode("Self-Service")).toBe("self-service");
    expect(normalizeWorkflowMode("CENTRALIZED")).toBe("centralized");
  });

  it("returns null for null/undefined/empty", () => {
    expect(normalizeWorkflowMode(null)).toBe(null);
    expect(normalizeWorkflowMode(undefined)).toBe(null);
    expect(normalizeWorkflowMode("")).toBe(null);
    expect(normalizeWorkflowMode("   ")).toBe(null);
  });

  it("returns null for an unrecognized value rather than guessing", () => {
    expect(normalizeWorkflowMode("custom-mode")).toBe(null);
    expect(normalizeWorkflowMode("draft")).toBe(null);
  });
});

describe("generateOccurrences — used by SelfServiceOpenSlots UI", () => {
  it("expands a weekly service across the date range", () => {
    const svc = makeService(); // weekly Sundays
    const occs = generateOccurrences([svc], SUNDAY_2026_09_06, "2026-09-27");
    expect(occs.map((o) => o.date)).toEqual([
      "2026-09-06",
      "2026-09-13",
      "2026-09-20",
      "2026-09-27",
    ]);
  });

  it("returns an empty array if no occurrence falls in the range", () => {
    const svc = makeService({ day_of_week: 2 }); // Tuesday
    // Date range Sat → Mon — no Tuesdays
    const occs = generateOccurrences([svc], "2026-09-05", "2026-09-07");
    expect(occs).toEqual([]);
  });
});
