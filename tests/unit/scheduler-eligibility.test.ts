/**
 * Regression tests for the Codex QA 2026-05-15 eligibility bug.
 *
 * Bug: `canServeInMinistry` treated an empty `ministry_ids` array as "serves
 * anywhere," which meant brand-new volunteers got auto-assigned to teams they
 * weren't on. Codex saw 3 active volunteers (none on Worship) fill 12/12
 * Worship-Team slots. The fix tightens the predicate to require explicit
 * membership. Events still allow signups via a separate code path.
 */

import { describe, it, expect } from "vitest";
import { canServeInMinistry } from "@/lib/services/scheduler";
import type { Person } from "@/lib/types";

function makePerson(overrides: Partial<Person>): Person {
  // Minimal Person fixture — `canServeInMinistry` only reads `ministry_ids`.
  return {
    id: "p1",
    name: "Test Volunteer",
    email: "test@example.com",
    phone: null,
    photo_url: null,
    church_id: "c1",
    user_id: null,
    person_type: "volunteer",
    is_volunteer: true,
    status: "active",
    ministry_ids: [],
    role_ids: [],
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

describe("canServeInMinistry — strict eligibility", () => {
  it("returns true when ministry is in the volunteer's ministry_ids", () => {
    const v = makePerson({ ministry_ids: ["worship", "tech"] });
    expect(canServeInMinistry(v, "worship")).toBe(true);
    expect(canServeInMinistry(v, "tech")).toBe(true);
  });

  it("returns false when ministry is NOT in the volunteer's ministry_ids", () => {
    const v = makePerson({ ministry_ids: ["worship"] });
    expect(canServeInMinistry(v, "tech")).toBe(false);
  });

  it("returns false when volunteer has empty ministry_ids (the Codex bug)", () => {
    // Pre-fix this returned true; volunteers were auto-assigned to every team.
    const v = makePerson({ ministry_ids: [] });
    expect(canServeInMinistry(v, "worship")).toBe(false);
    expect(canServeInMinistry(v, "tech")).toBe(false);
  });

  it("returns false when the requested ministry id is empty string", () => {
    const v = makePerson({ ministry_ids: ["worship"] });
    expect(canServeInMinistry(v, "")).toBe(false);
  });

  it("is case-sensitive — IDs must match exactly", () => {
    // ministry_ids are Firestore doc IDs (lowercase by convention in this app).
    // Caller should normalize before calling.
    const v = makePerson({ ministry_ids: ["worship"] });
    expect(canServeInMinistry(v, "Worship")).toBe(false);
  });
});
