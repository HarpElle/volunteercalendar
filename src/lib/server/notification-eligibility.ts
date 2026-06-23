import { adminDb } from "@/lib/firebase/admin";
import type { Membership, SchedulerNotificationType } from "@/lib/types";
import { shouldNotifyScheduler } from "@/lib/utils/scheduler-notification-check";
import { log } from "@/lib/log";

/**
 * Notification eligibility resolver (Phase 2).
 *
 * Single source of truth for "should we send this notification?" Wraps:
 *   1. Org-level gate (Phase 4a placeholder — always "live" today;
 *      a hook the Phase 4a notification_mode field plugs into without
 *      re-touching the six call-sites that use this resolver)
 *   2. Membership lookup (volunteer prefs live on Membership, NOT on
 *      the Person doc — Cursor F-002 fix)
 *   3. Per-user channel preferences (reminder_preferences.channels for
 *      volunteers; scheduler_notification_preferences for schedulers,
 *      delegated to the existing shouldNotifyScheduler helper)
 *   4. Subscription-tier SMS gating (Starter+ for SMS)
 *
 * Behavior when info is missing: ALLOW. If the person doc has no
 * linked user_id, or there's no Membership record, there are no
 * stored preferences to honor — so we fall through to send. This
 * matches pre-Phase-2 behavior for unlinked recipients; the resolver
 * only blocks when it has positive opt-out info.
 *
 * Architecture: the Firestore-touching `resolveXEligibility` functions
 * are thin orchestrators around the pure `decideXVerdict` helpers
 * below. Tests target the pure helpers; integration paths cover the
 * orchestration end-to-end.
 */

export type VolunteerNotificationType =
  | "reminder"
  | "confirmation"
  | "schedule_published"
  | "assignment_change"
  | "swap_request_to_teammate";

export interface VolunteerEligibilityInput {
  churchId: string;
  /** People-doc id (Person), NOT user uid. */
  personId: string;
  notificationType: VolunteerNotificationType;
  /** Fallback channels to use when the membership exists but has no
   *  explicit reminder_preferences set. Reminders pass the church's
   *  `default_reminder_channels` here so org-wide defaults still
   *  apply for users who haven't customized. Other notification
   *  paths (publish, notify, swap) leave this undefined and inherit
   *  the resolver's hardcoded `["email"]`. */
  defaultChannelsIfMissing?: string[];
}

export interface SchedulerEligibilityInput {
  churchId: string;
  /** Firebase Auth uid of the scheduler/admin recipient. */
  userId: string;
  notificationType: SchedulerNotificationType;
  /** Urgent paths (day-of absence, swap escalation when no cover)
   *  bypass per-user channel prefs but still respect org-pause
   *  and membership status. */
  urgent?: boolean;
}

export interface ChannelVerdict {
  email: boolean;
  sms: boolean;
  /** Whether the recipient should still receive an in-app inbox
   *  notification when this verdict gates outbound email/SMS.
   *
   *  - `true` when the user is reachable AT ALL: email OR sms is on,
   *    OR the org is specifically in `in_app_only` mode (the entire
   *    POINT of that mode — silence outbound, keep the inbox).
   *  - `false` when the user is structurally unreachable: no membership,
   *    inactive membership, no user link, explicit opt-out of the type
   *    via scheduler_notification_preferences, or future org `paused`
   *    mode.
   *
   *  Routes that fire in-app via `createUserNotification` should gate
   *  on this flag so a deactivated user or an opted-out scheduler
   *  doesn't accumulate inbox noise.
   */
  inApp: boolean;
  /** When channels are blocked, a short tag explaining why — useful
   *  for log lines and metrics (e.g. "user_opted_out", "org_paused"). */
  reason?: string;
}

export interface OrgGate {
  live: boolean;
  tier: string;
  reason?: string;
}

const BLOCKED = (reason: string): ChannelVerdict => ({
  email: false,
  sms: false,
  inApp: false,
  reason,
});

/**
 * Variant of BLOCKED used by `org_in_app_only` — outbound email/SMS
 * are suppressed but the in-app inbox still writes (the entire
 * intent of the in_app_only mode: demo orgs / staging where you
 * want to see workflow behavior without burning Resend/Twilio
 * quota or spamming real recipients).
 */
const IN_APP_ONLY: ChannelVerdict = {
  email: false,
  sms: false,
  inApp: true,
  reason: "org_in_app_only",
};

// ─── Pure decision helpers (unit-tested) ────────────────────────────

export function decideVolunteerVerdict(
  orgGate: OrgGate,
  membership: Membership | null,
  userIdResolved: boolean,
  defaultChannelsIfMissing: string[] = ["email"],
): ChannelVerdict {
  // Codex 2026-06-23 retest #3: precedence had org_in_app_only
  // short-circuiting BEFORE per-user state was evaluated, so a
  // volunteer with channels=["none"] still got an inbox row when
  // the org was in in_app_only. Correct precedence:
  //   1. Hard org block (future "paused")        — total silence
  //   2. Structural recipient blocks (no link,
  //      no/inactive membership, opt-out)        — total silence
  //   3. org_in_app_only override                 — outbound off, inbox on
  //   4. Per-user channel prefs                   — normal flow

  // 1. Hard pause (future). Total silence — no inbox.
  if (!orgGate.live && orgGate.reason !== "in_app_only") {
    return BLOCKED(`org_${orgGate.reason ?? "paused"}`);
  }

  // 2. No linked user — no inbox to write to. In `in_app_only` mode
  //    we also suppress outbound; otherwise the caller can fall
  //    through to Person-doc contact info.
  if (!userIdResolved) {
    if (orgGate.reason === "in_app_only") {
      return BLOCKED("org_in_app_only");
    }
    return {
      email: true,
      sms: orgGate.tier !== "free",
      inApp: false,
      reason: "no_user_link",
    };
  }

  // 2b. No membership record — same shape as no_user_link.
  if (!membership) {
    if (orgGate.reason === "in_app_only") {
      return BLOCKED("org_in_app_only");
    }
    return {
      email: true,
      sms: orgGate.tier !== "free",
      inApp: false,
      reason: "no_membership",
    };
  }

  // 2c. Inactive membership — fully block. in_app_only doesn't
  //     resurrect a deactivated user.
  if (membership.status !== "active") {
    return BLOCKED(`membership_${membership.status}`);
  }

  // 2d. Explicit user opt-out — fully block including inbox. The user
  //     said "no" to ALL notifications from this org; in_app_only is
  //     an org-LEVEL setting and must not undo that personal choice.
  //     User pref always wins; the default only fills the gap.
  const channels =
    membership.reminder_preferences?.channels ?? defaultChannelsIfMissing;
  if (channels.includes("none")) {
    return BLOCKED("user_opted_out");
  }

  // 3. NOW apply the in_app_only outbound override — confirmed the
  //    recipient is active + opted-in, so the inbox row should fire.
  if (orgGate.reason === "in_app_only") {
    return IN_APP_ONLY;
  }

  // 4. Org live + active opted-in user — honor explicit channels.
  const wantsEmail = channels.includes("email");
  const wantsSms = channels.includes("sms");
  const smsEligible = orgGate.tier !== "free";
  const email = wantsEmail;
  const sms = smsEligible && wantsSms;

  return {
    email,
    sms,
    // Active user with non-"none" prefs → inbox writes too.
    inApp: email || sms,
  };
}

export function decideSchedulerVerdict(
  orgGate: OrgGate,
  membership: Membership | null,
  notificationType: SchedulerNotificationType,
  urgent: boolean,
): ChannelVerdict {
  // Codex 2026-06-23 retest #3/#4 — precedence rewrite. Pre-existing
  // routes that filter membershipsSnap on status="active" upstream
  // were masking some of these; fixing both helpers keeps the
  // resolver invariants honest.
  //   1. Hard org pause (future)                 — total silence
  //   2. Structural recipient blocks              — total silence
  //   2b. Master opt-out reminder_preferences.channels=["none"]
  //       — total silence, even urgent + in_app_only (retest #4)
  //   3. Urgent — bypasses scheduler_notification_preferences,
  //      still respects in_app_only (outbound off)
  //   4. Per-user scheduler prefs / in_app_only

  // 1. Hard pause (future).
  if (!orgGate.live && orgGate.reason !== "in_app_only") {
    return BLOCKED(`org_${orgGate.reason ?? "paused"}`);
  }

  // 2. Structural membership checks. Urgent never overrides these.
  if (!membership) {
    return BLOCKED("no_membership");
  }
  if (membership.status !== "active") {
    return BLOCKED(`membership_${membership.status}`);
  }

  // 2b. Master opt-out. `reminder_preferences.channels=["none"]` is
  //     the user's "I want NOTHING from this org" kill switch — the
  //     same field decideVolunteerVerdict honors. It is STRONGER than
  //     the urgent override and the in_app_only inbox fallback:
  //     someone who set this gets no email, no SMS, AND no inbox row,
  //     even for a day-of emergency absence. Codex retest #4 caught
  //     urgent absence writing an inbox row to a channels=["none"]
  //     scheduler. Only block when the field is EXPLICITLY set to
  //     include "none" — undefined means "never customized," which
  //     falls through to scheduler_notification_preferences below.
  //     This is intentionally distinct from scheduler_notification_
  //     preferences, which urgent CAN still override (W12-B).
  if (membership.reminder_preferences?.channels?.includes("none")) {
    return BLOCKED("user_opted_out");
  }

  // 3. Urgent path. Bypasses per-user channel prefs but respects
  //    in_app_only (org_in_app_only suppresses outbound regardless
  //    of urgency — this is the right precedence for demo orgs).
  if (urgent) {
    if (orgGate.reason === "in_app_only") {
      return IN_APP_ONLY;
    }
    const sms = orgGate.tier !== "free";
    return { email: true, sms, inApp: true, reason: "urgent" };
  }

  // 4. Per-user scheduler prefs. Opt-out of this notification type
  //    blocks the inbox row too — the user explicitly said no.
  const { email, sms } = shouldNotifyScheduler(
    membership,
    notificationType,
    orgGate.tier,
  );
  if (!email && !sms) {
    return BLOCKED("scheduler_prefs_off");
  }

  // 5. NOW apply in_app_only after confirming opt-in — the inbox
  //    row should actually fire for an opted-in scheduler.
  if (orgGate.reason === "in_app_only") {
    return IN_APP_ONLY;
  }

  return { email, sms, inApp: true };
}

// ─── Firestore-touching orchestrators ───────────────────────────────

/**
 * Org-level gate. Reads `ChurchSettings.notification_mode`. When
 * "in_app_only", returns `live: false, reason: "in_app_only"` so all
 * volunteer + scheduler email/SMS verdicts BLOCK. In-app notification
 * writes happen outside the resolver path and are unaffected.
 *
 * On lookup failure: returns live + free-tier (safe-fallback: don't
 * silence the org just because Firestore hiccuped).
 */
export async function checkOrgGate(churchId: string): Promise<OrgGate> {
  try {
    const churchDoc = await adminDb.doc(`churches/${churchId}`).get();
    const data = churchDoc.data() ?? {};
    const tier = (data.subscription_tier as string) || "free";
    const settings = (data.settings as Record<string, unknown> | undefined) ?? {};
    const mode = settings.notification_mode as string | undefined;
    if (mode === "in_app_only") {
      return { live: false, tier, reason: "in_app_only" };
    }
    return { live: true, tier };
  } catch (err) {
    log.warn("notification-eligibility: org gate lookup failed", {
      church_id: churchId,
      error: err,
    });
    return { live: true, tier: "free" };
  }
}

async function getMembership(
  churchId: string,
  userId: string,
): Promise<Membership | null> {
  const id = `${userId}_${churchId}`;
  const doc = await adminDb.doc(`memberships/${id}`).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Membership;
}

async function resolveUserIdFromPersonId(
  churchId: string,
  personId: string,
): Promise<string | null> {
  try {
    const personDoc = await adminDb
      .doc(`churches/${churchId}/people/${personId}`)
      .get();
    if (!personDoc.exists) return null;
    return (personDoc.data()?.user_id as string) || null;
  } catch {
    return null;
  }
}

/**
 * Decide which channels are eligible for a volunteer-targeted
 * notification. Returns the channels the caller should send on
 * (intersected with whatever the caller has available — e.g. don't
 * send email if email is null even when this returns email: true).
 */
export async function resolveVolunteerEligibility(
  input: VolunteerEligibilityInput,
  /**
   * Antigravity F-002 perf: callers that resolve eligibility for MANY
   * recipients in a loop should fetch the org gate ONCE
   * (`checkOrgGate`) and pass it here, then run the per-recipient
   * resolves in `Promise.all`. That turns 3×N sequential reads (org +
   * person + membership, re-fetching the identical org doc every
   * iteration) into org-once + 2×N parallel — avoiding the Vercel
   * function-timeout risk on large publishes. Omit for single sends.
   */
  prefetchedOrgGate?: OrgGate,
): Promise<ChannelVerdict> {
  const orgGate = prefetchedOrgGate ?? (await checkOrgGate(input.churchId));
  // Codex 2026-06-23 retest #2 fix: previously a duplicate
  // `if (!orgGate.live)` short-circuit here returned a vanilla
  // BLOCKED before the pure helper could resolve in_app_only to
  // the IN_APP_ONLY verdict (inApp=true). Let the pure helper
  // make the org-gate decision — it's the only place that knows
  // how to distinguish in_app_only from a hard pause.
  const userId = await resolveUserIdFromPersonId(
    input.churchId,
    input.personId,
  );
  const membership = userId
    ? await getMembership(input.churchId, userId)
    : null;
  return decideVolunteerVerdict(
    orgGate,
    membership,
    !!userId,
    input.defaultChannelsIfMissing,
  );
}

/**
 * Decide which channels are eligible for a scheduler/admin-targeted
 * notification. Composes the existing shouldNotifyScheduler helper
 * (which handles enabled_types + urgency-driven channel routing)
 * with the org-pause gate.
 */
export async function resolveSchedulerEligibility(
  input: SchedulerEligibilityInput,
  /** Pre-fetched org gate for loop callers — see resolveVolunteerEligibility
   *  (Antigravity F-002 perf). */
  prefetchedOrgGate?: OrgGate,
): Promise<ChannelVerdict> {
  const orgGate = prefetchedOrgGate ?? (await checkOrgGate(input.churchId));
  // Codex 2026-06-23 retest #2 fix: see resolveVolunteerEligibility
  // above. The duplicate org-gate short-circuit hid in_app_only's
  // inApp=true verdict from every scheduler route, including
  // /api/notify/absence which then went on to (incorrectly) apply
  // the urgent-override-prefs branch in decideAbsenceChannels.
  const membership = await getMembership(input.churchId, input.userId);
  return decideSchedulerVerdict(
    orgGate,
    membership,
    input.notificationType,
    !!input.urgent,
  );
}
