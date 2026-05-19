/**
 * Compliance gate for OnboardingStep.expires_in_days (PR #31) + scheduler
 * + onboarding pipeline (PR #33).
 *
 * Before PR #33, the scheduler's hasCompletedPrerequisites + the onboarding
 * page's getVolunteerStage both checked only `status === "completed"` and
 * ignored the per-volunteer expires_at. So a volunteer whose background
 * check ran out yesterday would still be auto-assigned to children's-
 * ministry roles today — exactly the failure mode the 365-day expiry was
 * supposed to prevent.
 *
 * Now both paths call isJourneyStepEffectivelyValid, which gates on
 * status AND on expires_at > today.
 */

import { describe, it, expect } from "vitest";
import {
  isJourneyStepEffectivelyValid,
  getOrgEligibility,
  getVolunteerStage,
} from "@/lib/utils/eligibility";
import type {
  Person,
  Ministry,
  OnboardingStep,
  VolunteerJourneyStep,
} from "@/lib/types";
import { ORG_WIDE_MINISTRY_ID } from "@/lib/types";

// Pinned past + far-future dates so the wall clock can't make these
// boundary cases flaky. Originally written with "tomorrow" = 2026-05-19,
// which the system clock crossed before all tests had a chance to run.
const TODAY = "2026-05-18";
const YESTERDAY_T0 = "2026-05-17T23:00:00.000Z";
const TOMORROW_T0 = "2099-12-31T00:00:00.000Z";
const ONE_YEAR_OUT = "2099-12-31T15:00:00.000Z";
const COMPLETED_AT = "2026-05-18T15:00:00.000Z";

function step(overrides: Partial<VolunteerJourneyStep> = {}): VolunteerJourneyStep {
  return {
    step_id: "bg",
    ministry_id: ORG_WIDE_MINISTRY_ID,
    status: "completed",
    completed_at: COMPLETED_AT,
    expires_at: null,
    verified_by: null,
    notes: null,
    ...overrides,
  };
}

function person(journey: VolunteerJourneyStep[]): Person {
  return {
    id: "p1",
    name: "Test Volunteer",
    email: "t@example.com",
    phone: null,
    photo_url: null,
    church_id: "c1",
    user_id: null,
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

const ORG_PREREQ_BG: OnboardingStep = {
  id: "bg",
  label: "Background Check",
  type: "background_check",
  expires_in_days: 365,
};

const CHILDREN_MIN: Ministry = {
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

describe("isJourneyStepEffectivelyValid", () => {
  it("returns true for a completed step with no expires_at (backward-compat)", () => {
    expect(isJourneyStepEffectivelyValid(step(), TODAY)).toBe(true);
  });

  it("returns true for a completed step with future expires_at", () => {
    expect(
      isJourneyStepEffectivelyValid(step({ expires_at: ONE_YEAR_OUT }), TODAY),
    ).toBe(true);
  });

  it("returns true for a waived step", () => {
    expect(isJourneyStepEffectivelyValid(step({ status: "waived" }), TODAY)).toBe(true);
  });

  it("returns FALSE for a completed step with past expires_at (the compliance bug)", () => {
    expect(
      isJourneyStepEffectivelyValid(step({ expires_at: YESTERDAY_T0 }), TODAY),
    ).toBe(false);
  });

  it("returns false for a pending step", () => {
    expect(isJourneyStepEffectivelyValid(step({ status: "pending" }), TODAY)).toBe(false);
  });

  it("returns false for in_progress", () => {
    expect(isJourneyStepEffectivelyValid(step({ status: "in_progress" }), TODAY)).toBe(false);
  });

  it("returns false for undefined step", () => {
    expect(isJourneyStepEffectivelyValid(undefined, TODAY)).toBe(false);
  });

  it("treats expires_at exactly equal to today as expired (defensive: midnight boundary)", () => {
    // expires_at on the same calendar day → treat as gone
    expect(
      isJourneyStepEffectivelyValid(
        step({ expires_at: `${TODAY}T12:00:00.000Z` }),
        TODAY,
      ),
    ).toBe(false);
  });
});

describe("getOrgEligibility — expiry transitions", () => {
  it("expired completion downgrades cleared → in_progress (volunteer needs to renew)", () => {
    const vol = person([step({ expires_at: YESTERDAY_T0 })]);
    expect(getOrgEligibility(vol, [ORG_PREREQ_BG])).toBe("in_progress");
  });

  it("valid completion still reads as cleared", () => {
    const vol = person([step({ expires_at: TOMORROW_T0 })]);
    expect(getOrgEligibility(vol, [ORG_PREREQ_BG])).toBe("cleared");
  });

  it("no expires_at preserves backward compatibility", () => {
    const vol = person([step()]);
    expect(getOrgEligibility(vol, [ORG_PREREQ_BG])).toBe("cleared");
  });
});

describe("getVolunteerStage — expiry transitions", () => {
  it("ministry stage demotes cleared → in_progress when a prereq expired", () => {
    const vol = person([step({ expires_at: YESTERDAY_T0 })]);
    expect(getVolunteerStage(vol, CHILDREN_MIN, [ORG_PREREQ_BG])).toBe(
      "in_progress",
    );
  });

  it("ministry stage stays cleared when expires_at is in the future", () => {
    const vol = person([step({ expires_at: TOMORROW_T0 })]);
    expect(getVolunteerStage(vol, CHILDREN_MIN, [ORG_PREREQ_BG])).toBe("cleared");
  });
});
