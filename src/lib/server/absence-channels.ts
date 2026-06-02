/**
 * Absence-alert channel decider (Wave 12 B).
 *
 * Pure function that resolves WHICH channels (email / SMS) actually
 * fire when a volunteer notifies they can't make it. The two modes:
 *
 *   Normal (advance notice) — respect each recipient's
 *     scheduler_notification_preferences. A scheduler who turned off
 *     SMS for absence_alert simply doesn't get SMS.
 *
 *   Urgent (day-of emergency) — bypass preferences entirely. The
 *     volunteer is texting in sick, has a flat tire, etc. The
 *     scheduler/admin needs to know NOW; honoring an SMS opt-out
 *     means the news doesn't land in time. Email also goes through
 *     regardless of prefs, for the same reason.
 *
 * We still gate on whether the channel has CONTACT INFO — no point
 * sending email to a recipient with no email on file. That's not a
 * preference, it's a physical "can we reach them" check.
 *
 * Extracted from the route handler so the override-prefs contract is
 * regression-tested in isolation. If this drifts (e.g. a future
 * change starts honoring SMS prefs in the urgent path), the test
 * fails before prod sees it.
 */

export interface AbsenceChannelInput {
  /** True iff the volunteer hit the day-of urgent path. */
  urgent: boolean;
  /** Scheduler/admin preference: do they want email for absences? */
  prefsEmail: boolean;
  /** Scheduler/admin preference: do they want SMS for absences? */
  prefsSms: boolean;
  /** Does the recipient have a working email on file? */
  hasEmail: boolean;
  /** Does the recipient have a phone on file? */
  hasPhone: boolean;
}

export interface AbsenceChannelDecision {
  email: boolean;
  sms: boolean;
}

/**
 * Decide which channels to use when notifying a single
 * scheduler/admin about a volunteer absence.
 *
 * @returns `{ email, sms }` — true means send on that channel.
 */
export function decideAbsenceChannels(
  input: AbsenceChannelInput,
): AbsenceChannelDecision {
  if (input.urgent) {
    // Day-of emergency: override prefs. Still skip the channel if
    // we have no way to reach the recipient on it.
    return {
      email: input.hasEmail,
      sms: input.hasPhone,
    };
  }

  // Normal path: respect prefs AND contact-info availability.
  return {
    email: input.prefsEmail && input.hasEmail,
    sms: input.prefsSms && input.hasPhone,
  };
}
