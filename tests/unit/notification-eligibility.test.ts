/**
 * Phase 2 — pure-helper tests for the notification eligibility resolver.
 *
 * The Firestore-touching orchestrators in
 * src/lib/server/notification-eligibility.ts are thin wrappers around
 * the pure helpers tested here. Integration paths cover the
 * Firestore-binding end-to-end.
 */

import { describe, it, expect } from "vitest";
import {
  decideVolunteerVerdict,
  decideSchedulerVerdict,
} from "@/lib/server/notification-eligibility";
import type { Membership } from "@/lib/types";

const LIVE_PAID = { live: true, tier: "starter" };
const LIVE_FREE = { live: true, tier: "free" };
const PAUSED = { live: false, tier: "starter", reason: "paused" };
const IN_APP_ONLY = { live: false, tier: "starter", reason: "in_app_only" };

function mkMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: "user-a_church-a",
    user_id: "user-a",
    church_id: "church-a",
    role: "volunteer",
    status: "active",
    ministry_scope: [],
    invited_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Membership;
}

describe("decideVolunteerVerdict", () => {
  it("blocks all channels when org is paused", () => {
    const v = decideVolunteerVerdict(PAUSED, mkMembership(), true);
    expect(v.email).toBe(false);
    expect(v.sms).toBe(false);
    expect(v.reason).toMatch(/^org_/);
  });

  it("falls through with email=true when person has no linked user (pre-Phase-2 default)", () => {
    const v = decideVolunteerVerdict(LIVE_PAID, null, false);
    expect(v.email).toBe(true);
    expect(v.sms).toBe(true);
    expect(v.reason).toBe("no_user_link");
  });

  it("falls through with email=true on free tier when person has no linked user (SMS gated by tier)", () => {
    const v = decideVolunteerVerdict(LIVE_FREE, null, false);
    expect(v.email).toBe(true);
    expect(v.sms).toBe(false);
  });

  it("falls through when membership is missing (linked uid but no record)", () => {
    const v = decideVolunteerVerdict(LIVE_PAID, null, true);
    expect(v.email).toBe(true);
    expect(v.reason).toBe("no_membership");
  });

  it("blocks when membership is inactive", () => {
    const v = decideVolunteerVerdict(
      LIVE_PAID,
      mkMembership({ status: "inactive" }),
      true,
    );
    expect(v.email).toBe(false);
    expect(v.sms).toBe(false);
    expect(v.reason).toBe("membership_inactive");
  });

  it("blocks when user explicitly opted out (channels=['none'])", () => {
    const v = decideVolunteerVerdict(
      LIVE_PAID,
      mkMembership({ reminder_preferences: { channels: ["none"] } }),
      true,
    );
    expect(v.email).toBe(false);
    expect(v.sms).toBe(false);
    expect(v.reason).toBe("user_opted_out");
  });

  it("returns email only when channels=['email']", () => {
    const v = decideVolunteerVerdict(
      LIVE_PAID,
      mkMembership({ reminder_preferences: { channels: ["email"] } }),
      true,
    );
    expect(v).toEqual({ email: true, sms: false });
  });

  it("returns both when channels include email+sms on paid tier", () => {
    const v = decideVolunteerVerdict(
      LIVE_PAID,
      mkMembership({ reminder_preferences: { channels: ["email", "sms"] } }),
      true,
    );
    expect(v).toEqual({ email: true, sms: true });
  });

  it("suppresses SMS on free tier even when channels include sms", () => {
    const v = decideVolunteerVerdict(
      LIVE_FREE,
      mkMembership({ reminder_preferences: { channels: ["email", "sms"] } }),
      true,
    );
    expect(v).toEqual({ email: true, sms: false });
  });

  it("defaults to email when membership has no reminder_preferences", () => {
    const v = decideVolunteerVerdict(LIVE_PAID, mkMembership(), true);
    expect(v).toEqual({ email: true, sms: false });
  });

  it("honors defaultChannelsIfMissing when membership has no prefs (Phase 2 hotfix #255)", () => {
    const v = decideVolunteerVerdict(
      LIVE_PAID,
      mkMembership(),
      true,
      ["email", "sms"],
    );
    expect(v).toEqual({ email: true, sms: true });
  });

  it("in_app_only org mode blocks email + SMS (Phase 4a)", () => {
    const v = decideVolunteerVerdict(
      IN_APP_ONLY,
      mkMembership({ reminder_preferences: { channels: ["email", "sms"] } }),
      true,
    );
    expect(v.email).toBe(false);
    expect(v.sms).toBe(false);
    expect(v.reason).toBe("org_in_app_only");
  });
});

describe("decideSchedulerVerdict", () => {
  const SCHED_ALL = mkMembership({
    role: "scheduler",
    scheduler_notification_preferences: {
      enabled_types: [
        "assignment_change",
        "absence_alert",
        "swap_request",
        "self_removal",
        "schedule_published",
      ],
      channels: {
        standard: ["email"],
        urgent: ["email", "sms"],
      },
      ministry_scope: [],
    },
  });

  it("blocks when org is paused — even urgent (THE regression we'd hate)", () => {
    const v = decideSchedulerVerdict(PAUSED, SCHED_ALL, "absence_alert", true);
    expect(v.email).toBe(false);
    expect(v.sms).toBe(false);
    expect(v.reason).toMatch(/^org_/);
  });

  it("blocks when membership doesn't exist", () => {
    const v = decideSchedulerVerdict(LIVE_PAID, null, "absence_alert", false);
    expect(v.email).toBe(false);
    expect(v.reason).toBe("no_membership");
  });

  it("blocks deactivated schedulers — even urgent", () => {
    const v = decideSchedulerVerdict(
      LIVE_PAID,
      mkMembership({ status: "inactive" }),
      "absence_alert",
      true,
    );
    expect(v.email).toBe(false);
    expect(v.sms).toBe(false);
    expect(v.reason).toBe("membership_inactive");
  });

  it("urgent bypasses per-user channel prefs", () => {
    // Scheduler with ALL channels off in prefs — urgent still gets through.
    const optedOut = mkMembership({
      role: "scheduler",
      scheduler_notification_preferences: {
        enabled_types: [],
        channels: { standard: ["none"], urgent: ["none"] },
        ministry_scope: [],
      },
    });
    const v = decideSchedulerVerdict(LIVE_PAID, optedOut, "absence_alert", true);
    expect(v.email).toBe(true);
    expect(v.sms).toBe(true);
    expect(v.reason).toBe("urgent");
  });

  it("urgent on free tier still suppresses SMS (tier physics, not prefs)", () => {
    const v = decideSchedulerVerdict(LIVE_FREE, SCHED_ALL, "absence_alert", true);
    expect(v.email).toBe(true);
    expect(v.sms).toBe(false);
  });

  it("non-urgent respects scheduler prefs (delegates to shouldNotifyScheduler)", () => {
    const v = decideSchedulerVerdict(
      LIVE_PAID,
      SCHED_ALL,
      "absence_alert",
      false,
    );
    // SCHED_ALL has absence_alert enabled + urgent channels=['email','sms']
    // but the resolver looks up urgency from the type meta — absence_alert
    // IS urgent (per src/lib/constants), so we expect email+sms here too.
    expect(v.email).toBe(true);
    expect(v.sms).toBe(true);
  });

  it("in_app_only org mode blocks scheduler email+SMS (Phase 4a) — even urgent", () => {
    const v = decideSchedulerVerdict(IN_APP_ONLY, SCHED_ALL, "absence_alert", true);
    expect(v.email).toBe(false);
    expect(v.sms).toBe(false);
    expect(v.reason).toBe("org_in_app_only");
  });

  it("non-urgent blocks when scheduler turned off the type", () => {
    const offForAbsence = mkMembership({
      role: "scheduler",
      scheduler_notification_preferences: {
        enabled_types: ["swap_request"], // no absence_alert
        channels: { standard: ["email"], urgent: ["email", "sms"] },
        ministry_scope: [],
      },
    });
    const v = decideSchedulerVerdict(
      LIVE_PAID,
      offForAbsence,
      "absence_alert",
      false,
    );
    expect(v.email).toBe(false);
    expect(v.sms).toBe(false);
    expect(v.reason).toBe("scheduler_prefs_off");
  });
});
