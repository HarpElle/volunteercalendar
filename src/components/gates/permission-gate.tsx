"use client";

import { useAuth } from "@/lib/context/auth-context";
import { canAccessFeature, type FeatureArea } from "@/lib/auth/permissions";
import type { Membership, PermissionFlag } from "@/lib/types";
import { hasPermission } from "@/lib/auth/permissions";

/**
 * PermissionGate — hides children if the user lacks a role or permission flag.
 *
 * Two modes:
 * 1. `feature="scheduling"` → uses canAccessFeature() for broad area gating
 * 2. `permission="checkin_volunteer"` → uses hasPermission() for granular flag checks
 *
 * Does NOT check tier-level feature flags — use FeatureGate for that.
 * Combine both for complete gating:
 *   <FeatureGate feature="checkin_enabled">
 *     <PermissionGate feature="checkin">
 *       <CheckInDashboard />
 *     </PermissionGate>
 *   </FeatureGate>
 */

interface FeatureGateProps {
  /** Feature area to check (uses canAccessFeature) */
  feature: FeatureArea;
  permission?: never;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface PermissionFlagGateProps {
  feature?: never;
  /** Specific permission flag to check */
  permission: PermissionFlag;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

type PermissionGateProps = FeatureGateProps | PermissionFlagGateProps;

export function PermissionGate({ feature, permission, children, fallback = null }: PermissionGateProps) {
  const { activeMembership } = useAuth();

  if (!activeMembership || activeMembership.status !== "active") {
    return <>{fallback}</>;
  }

  let allowed = false;

  if (feature) {
    allowed = canAccessFeature(activeMembership as Membership, feature);
  } else if (permission) {
    allowed = hasPermission(activeMembership as Membership, permission);
  }

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

/**
 * usePermission — hook version for imperative checks.
 */
export function usePermission(featureOrPermission: FeatureArea | PermissionFlag): boolean {
  const { activeMembership } = useAuth();
  if (!activeMembership || activeMembership.status !== "active") return false;

  const m = activeMembership as Membership;

  // Try as FeatureArea first
  const featureAreas: FeatureArea[] = ["scheduling", "checkin", "rooms", "events", "service_planning", "stage_sync"];
  if (featureAreas.includes(featureOrPermission as FeatureArea)) {
    return canAccessFeature(m, featureOrPermission as FeatureArea);
  }

  // Try as PermissionFlag
  const permFlags: PermissionFlag[] = ["event_coordinator", "facility_coordinator", "checkin_volunteer"];
  if (permFlags.includes(featureOrPermission as PermissionFlag)) {
    return hasPermission(m, featureOrPermission as PermissionFlag);
  }

  return false;
}
