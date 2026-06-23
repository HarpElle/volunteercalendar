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
  if (!orgGate.live) {
    // The one mode where in-app inbox still writes. Future "paused"
    // mode (when added) would BLOCK in-app too.
    if (orgGate.reason === "in_app_only") return IN_APP_ONLY;
    return BLOCKED(`org_${orgGate.reason ?? "paused"}`);
  }

  if (!userIdResolved) {
    // No linked user account → no inbox to write to, but caller can
    // still attempt to email/SMS via Person-doc contact info.
    return {
      email: true,
      sms: orgGate.tier !== "free",
      inApp: false,
      reason: "no_user_link",
    };
  }

  if (!membership) {
    return {
      email: true,
      sms: orgGate.tier !== "free",
      inApp: false,
      reason: "no_membership",
    };
  }
  if (membership.status !== "active") {
    return BLOCKED(`membership_${membership.status}`);
  }

  // When the user has explicit prefs → honor them. When they don't →
  // fall back to the caller-provided default (typically the church's
  // org-wide `default_reminder_channels`). User pref always wins;
  // the default only fills the gap, never caps an opt-in.
  const channels =
    membership.reminder_preferences?.channels ?? defaultChannelsIfMissing;
  if (channels.includes("none")) {
    return BLOCKED("user_opted_out");
  }

  const wantsEmail = channels.includes("email");
  const wantsSms = channels.includes("sms");
  const smsEligible = orgGate.tier !== "free";
  const email = wantsEmail;
  const sms = smsEligible && wantsSms;

  return {
    email,
    sms,
    // Active user with non-"none" prefs → inbox writes too. The user
    // has chosen what channels they want; the inbox is always part
    // of the experience.
    inApp: email || sms,
  };
}

export function decideSchedulerVerdict(
  orgGate: OrgGate,
  membership: Membership | null,
  notificationType: SchedulerNotificationType,
  urgent: boolean,
): ChannelVerdict {
  if (!orgGate.live) {
    // Org in_app_only: suppress outbound email/SMS but the scheduler
    // STILL gets the in-app inbox row so they can see the alert in
    // the UI. Codex 2026-06-23 verification surfaced this as a bug
    // in the absence route — the in-app row was being dropped along
    // with email/SMS. The fix is centralised here so every route
    // that gates on resolveSchedulerEligibility gets the right answer.
    if (orgGate.reason === "in_app_only") return IN_APP_ONLY;
    return BLOCKED(`org_${orgGate.reason ?? "paused"}`);
  }

  // Even urgent paths respect membership status (a deactivated
  // scheduler shouldn't get pinged) and org pause (above). Urgent
  // only bypasses the per-user CHANNEL preferences, not the
  // structural eligibility checks.
  if (!membership) {
    return BLOCKED("no_membership");
  }
  if (membership.status !== "active") {
    return BLOCKED(`membership_${membership.status}`);
  }

  if (urgent) {
    const sms = orgGate.tier !== "free";
    return { email: true, sms, inApp: true, reason: "urgent" };
  }

  const { email, sms } = shouldNotifyScheduler(
    membership,
    notificationType,
    orgGate.tier,
  );
  if (!email && !sms) {
    // User opted out of this notification type — block inbox writes
    // too. They've explicitly said they don't want this type at all.
    return BLOCKED("scheduler_prefs_off");
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
): Promise<ChannelVerdict> {
  const orgGate = await checkOrgGate(input.churchId);
  if (!orgGate.live) {
    return BLOCKED(`org_${orgGate.reason ?? "paused"}`);
  }
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
): Promise<ChannelVerdict> {
  const orgGate = await checkOrgGate(input.churchId);
  if (!orgGate.live) {
    return BLOCKED(`org_${orgGate.reason ?? "paused"}`);
  }
  const membership = await getMembership(input.churchId, input.userId);
  return decideSchedulerVerdict(
    orgGate,
    membership,
    input.notificationType,
    !!input.urgent,
  );
}
