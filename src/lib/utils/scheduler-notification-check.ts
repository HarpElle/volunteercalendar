import type { Membership, SchedulerNotificationType } from "@/lib/types";
import { DEFAULT_SCHEDULER_NOTIFICATION_PREFS, SCHEDULER_NOTIFICATION_TYPES } from "@/lib/constants";

/**
 * Determines whether to send email and/or SMS to a scheduler/admin
 * based on their notification preferences and the org's subscription tier.
 */
export function shouldNotifyScheduler(
  membership: Membership,
  notificationType: SchedulerNotificationType,
  subscriptionTier: string,
): { email: boolean; sms: boolean } {
  const prefs = membership.scheduler_notification_preferences ?? DEFAULT_SCHEDULER_NOTIFICATION_PREFS;

  // Check if this notification type is enabled
  if (!prefs.enabled_types.includes(notificationType)) {
    return { email: false, sms: false };
  }

  // Determine urgency level
  const typeMeta = SCHEDULER_NOTIFICATION_TYPES.find((t) => t.value === notificationType);
  const urgency = typeMeta?.urgency ?? "standard";

  const channels = urgency === "urgent" ? prefs.channels.urgent : prefs.channels.standard;

  // SMS only available on Starter+ tier
  const smsEligible = subscriptionTier !== "free";

  return {
    email: channels.includes("email"),
    sms: smsEligible && channels.includes("sms"),
  };
}
