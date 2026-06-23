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
    expect(v).toEqual({ email: true, sms: false, inApp: true });
  });

  it("returns both when channels include email+sms on paid tier", () => {
    const v = decideVolunteerVerdict(
      LIVE_PAID,
      mkMembership({ reminder_preferences: { channels: ["email", "sms"] } }),
      true,
    );
    expect(v).toEqual({ email: true, sms: true, inApp: true });
  });

  it("suppresses SMS on free tier even when channels include sms", () => {
    const v = decideVolunteerVerdict(
      LIVE_FREE,
      mkMembership({ reminder_preferences: { channels: ["email", "sms"] } }),
      true,
    );
    expect(v).toEqual({ email: true, sms: false, inApp: true });
  });

  it("defaults to email when membership has no reminder_preferences", () => {
    const v = decideVolunteerVerdict(LIVE_PAID, mkMembership(), true);
    expect(v).toEqual({ email: true, sms: false, inApp: true });
  });

  it("honors defaultChannelsIfMissing when membership has no prefs (Phase 2 hotfix #255)", () => {
    const v = decideVolunteerVerdict(
      LIVE_PAID,
      mkMembership(),
      true,
      ["email", "sms"],
    );
    expect(v).toEqual({ email: true, sms: true, inApp: true });
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

  it("in_app_only org mode KEEPS inApp on (Codex 2026-06-23 fix)", () => {
    const v = decideVolunteerVerdict(IN_APP_ONLY, mkMembership(), true);
    expect(v.inApp).toBe(true);
  });

  it("inactive membership blocks inApp too (deactivated user → no inbox noise)", () => {
    const v = decideVolunteerVerdict(
      LIVE_PAID,
      mkMembership({ status: "inactive" }),
      true,
    );
    expect(v.inApp).toBe(false);
  });

  it("user-opted-out blocks inApp too", () => {
    const v = decideVolunteerVerdict(
      LIVE_PAID,
      mkMembership({ reminder_preferences: { channels: ["none"] } }),
      true,
    );
    expect(v.inApp).toBe(false);
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
    // Scheduler with ALL scheduler_notification_preferences channels
    // off — urgent still gets through. This is the W12-B contract:
    // urgent overrides scheduler_notification_preferences.
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

  // ── Master opt-out beats urgent + in_app_only (Codex retest #4) ───
  // reminder_preferences.channels=["none"] is the "I want NOTHING"
  // kill switch — STRONGER than the urgent override. Codex retest #4
  // caught urgent absence writing an inbox row to a channels=["none"]
  // scheduler. The distinction: urgent overrides
  // scheduler_notification_preferences (test above) but NOT the
  // master reminder_preferences opt-out (tests below).
  describe("master reminder_preferences opt-out (Codex retest #4)", () => {
    it("channels=['none'] blocks urgent absence inbox row — THE retest #4 regression", () => {
      const masterOptOut = mkMembership({
        role: "scheduler",
        reminder_preferences: { channels: ["none"] },
        scheduler_notification_preferences: {
          enabled_types: ["absence_alert"],
          channels: { standard: ["email"], urgent: ["email", "sms"] },
          ministry_scope: [],
        },
      });
      const v = decideSchedulerVerdict(LIVE_PAID, masterOptOut, "absence_alert", true);
      expect(v.email).toBe(false);
      expect(v.sms).toBe(false);
      expect(v.inApp).toBe(false);
      expect(v.reason).toBe("user_opted_out");
    });

    it("channels=['none'] blocks under in_app_only too (no inbox fallback)", () => {
      const masterOptOut = mkMembership({
        role: "scheduler",
        reminder_preferences: { channels: ["none"] },
        scheduler_notification_preferences: {
          enabled_types: ["absence_alert"],
          channels: { standard: ["email"], urgent: ["email", "sms"] },
          ministry_scope: [],
        },
      });
      const urgentV = decideSchedulerVerdict(IN_APP_ONLY, masterOptOut, "absence_alert", true);
      const standardV = decideSchedulerVerdict(IN_APP_ONLY, masterOptOut, "absence_alert", false);
      expect(urgentV.inApp).toBe(false);
      expect(urgentV.reason).toBe("user_opted_out");
      expect(standardV.inApp).toBe(false);
      expect(standardV.reason).toBe("user_opted_out");
    });

    it("undefined reminder_preferences falls through to scheduler prefs (not blocked)", () => {
      // A scheduler who never touched reminder_preferences must NOT be
      // silenced — the master kill switch only fires when explicitly set.
      const v = decideSchedulerVerdict(LIVE_PAID, SCHED_ALL, "absence_alert", true);
      expect(v.email).toBe(true);
      expect(v.reason).toBe("urgent");
    });
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

  it("in_app_only scheduler verdict KEEPS inApp on — urgent or not (Codex 2026-06-23 fix)", () => {
    const urgent = decideSchedulerVerdict(IN_APP_ONLY, SCHED_ALL, "absence_alert", true);
    const standard = decideSchedulerVerdict(IN_APP_ONLY, SCHED_ALL, "assignment_change", false);
    expect(urgent.inApp).toBe(true);
    expect(standard.inApp).toBe(true);
  });

  it("scheduler with prefs_off blocks inApp too (user said no to this type)", () => {
    const offForAbsence = mkMembership({
      role: "scheduler",
      scheduler_notification_preferences: {
        enabled_types: [],
        channels: { standard: ["email"], urgent: ["email", "sms"] },
        ministry_scope: [],
      },
    });
    const v = decideSchedulerVerdict(LIVE_PAID, offForAbsence, "absence_alert", false);
    expect(v.inApp).toBe(false);
  });

  it("urgent scheduler verdict sets inApp=true on live org", () => {
    const v = decideSchedulerVerdict(LIVE_PAID, SCHED_ALL, "absence_alert", true);
    expect(v.inApp).toBe(true);
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

  // ── Org precedence over urgent ─────────────────────────────────────
  // Codex 2026-06-23 retest #2: production Abbott Loop in in_app_only
  // received 12 urgent absence emails + 12 SMS because the urgent path
  // re-promoted org-suppressed channels. Precedence must be:
  //   org/membership state > urgent > per-user channel prefs.
  // Lock the contract so any future regression in the resolver OR a
  // route that wraps it surfaces at unit-test time.
  describe("org_in_app_only takes precedence over urgent (Codex retest #2)", () => {
    it("urgent + in_app_only returns email=false sms=false inApp=true", () => {
      const v = decideSchedulerVerdict(IN_APP_ONLY, SCHED_ALL, "absence_alert", true);
      expect(v).toEqual({
        email: false,
        sms: false,
        inApp: true,
        reason: "org_in_app_only",
      });
    });

    it("non-urgent + in_app_only behaves identically", () => {
      const v = decideSchedulerVerdict(IN_APP_ONLY, SCHED_ALL, "absence_alert", false);
      expect(v.email).toBe(false);
      expect(v.sms).toBe(false);
      expect(v.inApp).toBe(true);
    });

    it("urgent + live org bypasses per-user prefs (W12-B contract preserved)", () => {
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

    it("volunteer in_app_only also yields email=false sms=false inApp=true", () => {
      const v = decideVolunteerVerdict(
        IN_APP_ONLY,
        mkMembership({ reminder_preferences: { channels: ["email", "sms"] } }),
        true,
      );
      expect(v).toEqual({
        email: false,
        sms: false,
        inApp: true,
        reason: "org_in_app_only",
      });
    });
  });

  // ── Per-user opt-out overrides in_app_only (Codex retest #3) ──────
  // The retest #2 fix had org_in_app_only short-circuiting before
  // membership / opt-out checks. Production with Karen
  // channels=["none"] under in_app_only got a schedule_assignment
  // inbox row — directly contradicting the user's explicit choice.
  // The correct precedence:
  //   structural blocks (no link, no/inactive membership, user opt-out)
  //   > org_in_app_only (which only suppresses OUTBOUND for an
  //     otherwise-eligible recipient).
  describe("structural blocks override in_app_only (Codex retest #3)", () => {
    it("volunteer opt-out (channels:['none']) blocks inbox even under in_app_only", () => {
      const v = decideVolunteerVerdict(
        IN_APP_ONLY,
        mkMembership({ reminder_preferences: { channels: ["none"] } }),
        true,
      );
      expect(v.email).toBe(false);
      expect(v.sms).toBe(false);
      expect(v.inApp).toBe(false);
      expect(v.reason).toBe("user_opted_out");
    });

    it("inactive volunteer membership blocks inbox even under in_app_only", () => {
      const v = decideVolunteerVerdict(
        IN_APP_ONLY,
        mkMembership({ status: "inactive" }),
        true,
      );
      expect(v.inApp).toBe(false);
      expect(v.reason).toBe("membership_inactive");
    });

    it("no membership + in_app_only blocks all", () => {
      const v = decideVolunteerVerdict(IN_APP_ONLY, null, true);
      expect(v.email).toBe(false);
      expect(v.sms).toBe(false);
      expect(v.inApp).toBe(false);
      expect(v.reason).toBe("org_in_app_only");
    });

    it("no user link + in_app_only blocks all", () => {
      const v = decideVolunteerVerdict(IN_APP_ONLY, null, false);
      expect(v.email).toBe(false);
      expect(v.sms).toBe(false);
      expect(v.inApp).toBe(false);
      expect(v.reason).toBe("org_in_app_only");
    });

    it("scheduler with prefs_off blocks inbox even under in_app_only (non-urgent)", () => {
      const offForAbsence = mkMembership({
        role: "scheduler",
        scheduler_notification_preferences: {
          enabled_types: [],
          channels: { standard: ["email"], urgent: ["email", "sms"] },
          ministry_scope: [],
        },
      });
      const v = decideSchedulerVerdict(IN_APP_ONLY, offForAbsence, "absence_alert", false);
      expect(v.inApp).toBe(false);
      expect(v.reason).toBe("scheduler_prefs_off");
    });

    it("active opted-in volunteer under in_app_only still gets the inbox row (happy path preserved)", () => {
      const v = decideVolunteerVerdict(
        IN_APP_ONLY,
        mkMembership({ reminder_preferences: { channels: ["email"] } }),
        true,
      );
      expect(v).toEqual({
        email: false,
        sms: false,
        inApp: true,
        reason: "org_in_app_only",
      });
    });
  });
});
