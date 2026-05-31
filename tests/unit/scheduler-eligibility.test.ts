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
import {
  canServeInMinistry,
  hasActiveChildrenRestriction,
  isChildrenMinistry,
} from "@/lib/services/scheduler";
import type { Ministry, Person, PersonRestriction } from "@/lib/types";

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

// Wave 9 P0-3 — restriction gate.

function makeRestriction(overrides: Partial<PersonRestriction> = {}): PersonRestriction {
  return {
    id: "r1",
    cannot_serve_with_children: true,
    reason: "sor_match",
    notes: null,
    documented_by_user_id: "u-owner",
    documented_at: "2026-05-31T00:00:00Z",
    lifted_at: null,
    lifted_by_user_id: null,
    ...overrides,
  };
}

function makeMinistry(overrides: Partial<Ministry> = {}): Ministry {
  return {
    id: "m1",
    church_id: "c1",
    name: "Test Ministry",
    color: "#000",
    description: "",
    lead_user_id: "u-lead",
    lead_email: "lead@example.com",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("isChildrenMinistry", () => {
  it("returns true for category=children_youth", () => {
    expect(isChildrenMinistry(makeMinistry({ category: "children_youth" }))).toBe(true);
  });
  it("returns false for any other category", () => {
    expect(isChildrenMinistry(makeMinistry({ category: "worship" }))).toBe(false);
    expect(isChildrenMinistry(makeMinistry({ category: "hospitality" }))).toBe(false);
    expect(isChildrenMinistry(makeMinistry({ category: "operations" }))).toBe(false);
  });
  it("returns false when category is missing", () => {
    expect(isChildrenMinistry(makeMinistry())).toBe(false);
  });
  it("returns false when ministry doc is undefined", () => {
    expect(isChildrenMinistry(undefined)).toBe(false);
  });
});

describe("hasActiveChildrenRestriction", () => {
  it("returns false when restrictions array is missing", () => {
    expect(hasActiveChildrenRestriction(makePerson({}))).toBe(false);
  });
  it("returns false when restrictions array is empty", () => {
    expect(hasActiveChildrenRestriction(makePerson({ restrictions: [] }))).toBe(false);
  });
  it("returns true when an active sor_match restriction exists", () => {
    const v = makePerson({ restrictions: [makeRestriction({ reason: "sor_match" })] });
    expect(hasActiveChildrenRestriction(v)).toBe(true);
  });
  it("returns true regardless of reason — any active children-restriction counts", () => {
    const v = makePerson({ restrictions: [makeRestriction({ reason: "policy" })] });
    expect(hasActiveChildrenRestriction(v)).toBe(true);
    const v2 = makePerson({ restrictions: [makeRestriction({ reason: "other" })] });
    expect(hasActiveChildrenRestriction(v2)).toBe(true);
  });
  it("returns false when the only restriction is lifted", () => {
    const v = makePerson({
      restrictions: [makeRestriction({ lifted_at: "2026-05-30T00:00:00Z", lifted_by_user_id: "u-owner" })],
    });
    expect(hasActiveChildrenRestriction(v)).toBe(false);
  });
  it("returns true when at least one active restriction exists alongside lifted ones", () => {
    const v = makePerson({
      restrictions: [
        makeRestriction({ id: "r-old", lifted_at: "2026-05-30T00:00:00Z" }),
        makeRestriction({ id: "r-new" }),
      ],
    });
    expect(hasActiveChildrenRestriction(v)).toBe(true);
  });
  it("returns false when cannot_serve_with_children is false (defensive — should never be persisted that way, but the gate must be honest about its inputs)", () => {
    const v = makePerson({
      restrictions: [makeRestriction({ cannot_serve_with_children: false })],
    });
    expect(hasActiveChildrenRestriction(v)).toBe(false);
  });
});
