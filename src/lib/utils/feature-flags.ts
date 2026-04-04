import type { SubscriptionTier, FeatureFlags } from "@/lib/types";

/**
 * Returns the default feature flags for a given subscription tier.
 * These are the baseline — individual churches can have manual overrides
 * stored on their Church document (e.g., beta testers, founding discounts).
 */
export function getDefaultFeatureFlags(tier: SubscriptionTier): FeatureFlags {
  switch (tier) {
    case "free":
      return {
        checkin_enabled: false,
        rooms_enabled: false,
        stage_sync_enabled: false,
        service_planning_enabled: false,
        max_volunteers: 15,
        max_teams: 1,
        retention_dashboard: false,
        background_checks: false,
        calendar_feeds: false,
        custom_notifications: false,
      };
    case "starter":
      return {
        checkin_enabled: true,
        rooms_enabled: false,
        stage_sync_enabled: false,
        service_planning_enabled: true,
        max_volunteers: 25,
        max_teams: 3,
        retention_dashboard: false,
        background_checks: false,
        calendar_feeds: true,
        custom_notifications: false,
      };
    case "growth":
      return {
        checkin_enabled: true,
        rooms_enabled: true,
        stage_sync_enabled: false,
        service_planning_enabled: true,
        max_volunteers: 100,
        max_teams: -1,
        retention_dashboard: true,
        background_checks: true,
        calendar_feeds: true,
        custom_notifications: true,
      };
    case "pro":
    case "enterprise":
      return {
        checkin_enabled: true,
        rooms_enabled: true,
        stage_sync_enabled: true,
        service_planning_enabled: true,
        max_volunteers: -1,
        max_teams: -1,
        retention_dashboard: true,
        background_checks: true,
        calendar_feeds: true,
        custom_notifications: true,
      };
  }
}

/**
 * Resolves the effective feature flags for a church.
 * If the church has manual overrides (feature_flags on the document),
 * those take precedence. Otherwise, derive from subscription_tier.
 */
export function resolveFeatureFlags(
  tier: SubscriptionTier,
  overrides?: Partial<FeatureFlags> | null,
): FeatureFlags {
  const defaults = getDefaultFeatureFlags(tier);
  if (!overrides) return defaults;
  return { ...defaults, ...overrides };
}
