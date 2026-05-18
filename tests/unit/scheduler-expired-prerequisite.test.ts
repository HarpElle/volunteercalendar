/**
 * End-to-end gate: generateDraftSchedule must skip a volunteer whose
 * background check expired even when they're explicitly on the team and
 * the journey step is recorded as `status: "completed"`. This is the
 * compliance test that ties together OnboardingStep.expires_in_days
 * (PR #31) and the scheduler/eligibility helpers (PR #33).
 */

import { describe, it, expect } from "vitest";
import { generateDraftSchedule } from "@/lib/services/scheduler";
import type {
  Person,
  Service,
  Ministry,
  OnboardingStep,
  VolunteerJourneyStep,
  Household,
} from "@/lib/types";
import { ORG_WIDE_MINISTRY_ID } from "@/lib/types";

const TOMORROW_T0 = "2027-05-18T00:00:00.000Z";
const YESTERDAY_T0 = "2026-05-17T23:00:00.000Z";

function makeService(): Service {
  return {
    id: "svc1",
    church_id: "c1",
    name: "Sunday Worship",
    ministry_id: "children",
    ministries: null,
    day_of_week: 0,
    start_time: "10:00",
    end_time: "11:30",
    recurrence: "weekly",
    roles: [{ role_id: "greeter", title: "Greeter", count: 1 }],
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as unknown as Service;
}

function makeBgPrereq(): OnboardingStep {
  return {
    id: "bg",
    label: "Background Check",
    type: "background_check",
    expires_in_days: 365,
  };
}

function makeMinistry(): Ministry {
  return {
    id: "children",
    church_id: "c1",
    name: "Children's Ministry",
    color: "#abc",
    description: "",
    lead_user_id: "u1",
    lead_email: "l@example.com",
    requires_background_check: false,
    prerequisites: [],
  } as unknown as Ministry;
}

function makeVolunteer(
  id: string,
  journey: VolunteerJourneyStep[] = [],
): Person {
  return {
    id,
    name: `Volunteer ${id}`,
    email: `${id}@example.com`,
    phone: null,
    photo_url: null,
    church_id: "c1",
    user_id: `uid-${id}`,
    person_type: "volunteer",
    is_volunteer: true,
    status: "active",
    ministry_ids: ["children"],
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
    volunteer_journey: journey,
    qr_token: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as unknown as Person;
}

function completedStep(expiresAt: string | null): VolunteerJourneyStep {
  return {
    step_id: "bg",
    ministry_id: ORG_WIDE_MINISTRY_ID,
    status: "completed",
    completed_at: "2026-01-01T00:00:00Z",
    expires_at: expiresAt,
    verified_by: "admin",
    notes: null,
  };
}

describe("generateDraftSchedule — expired prerequisite gating", () => {
  it("auto-assigns the volunteer whose background check is still valid", () => {
    const result = generateDraftSchedule(
      "sched1",
      "c1",
      [makeService()],
      [makeVolunteer("alice", [completedStep(TOMORROW_T0)])],
      [] as Household[],
      "2026-09-06",
      "2026-09-06",
      [makeMinistry()],
      [makeBgPrereq()],
    );
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].volunteer_id).toBe("alice");
  });

  it("SKIPS a volunteer whose background check expired even though status is still 'completed'", () => {
    const result = generateDraftSchedule(
      "sched1",
      "c1",
      [makeService()],
      [makeVolunteer("alice", [completedStep(YESTERDAY_T0)])],
      [] as Household[],
      "2026-09-06",
      "2026-09-06",
      [makeMinistry()],
      [makeBgPrereq()],
    );
    expect(result.assignments).toHaveLength(0);
    // The slot becomes an unfilled-role conflict, which is the correct
    // observable behavior — the schedule shows the gap so the admin
    // re-runs the volunteer through the background-check process.
    expect(
      result.conflicts.some((c) => c.type === "unfilled_role"),
    ).toBe(true);
  });

  it("prefers the valid volunteer over the expired one when both are eligible candidates", () => {
    const result = generateDraftSchedule(
      "sched1",
      "c1",
      [makeService()],
      [
        makeVolunteer("expired", [completedStep(YESTERDAY_T0)]),
        makeVolunteer("valid", [completedStep(TOMORROW_T0)]),
      ],
      [] as Household[],
      "2026-09-06",
      "2026-09-06",
      [makeMinistry()],
      [makeBgPrereq()],
    );
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].volunteer_id).toBe("valid");
  });

  it("backward-compat: completed step with no expires_at is still treated as valid", () => {
    const result = generateDraftSchedule(
      "sched1",
      "c1",
      [makeService()],
      [makeVolunteer("alice", [completedStep(null)])],
      [] as Household[],
      "2026-09-06",
      "2026-09-06",
      [makeMinistry()],
      [makeBgPrereq()],
    );
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].volunteer_id).toBe("alice");
  });
});
