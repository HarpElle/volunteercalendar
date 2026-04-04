"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { resolveFeatureFlags } from "@/lib/utils/feature-flags";
import type { FeatureFlags, SubscriptionTier } from "@/lib/types";

/**
 * FeatureGate — hides children if a tier-level feature is disabled.
 *
 * Checks `church.feature_flags` (with manual overrides) resolved against
 * the church's subscription tier. Does NOT check user permissions —
 * use PermissionGate for role/flag checks.
 *
 * Usage:
 *   <FeatureGate feature="checkin_enabled">
 *     <CheckInNav />
 *   </FeatureGate>
 */

type BooleanFeature = {
  [K in keyof FeatureFlags]: FeatureFlags[K] extends boolean ? K : never;
}[keyof FeatureFlags];

interface FeatureGateProps {
  /** Feature flag key to check (boolean flags only) */
  feature: BooleanFeature;
  /** Content shown when the feature is enabled */
  children: React.ReactNode;
  /** Optional fallback shown when the feature is disabled */
  fallback?: React.ReactNode;
}

export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
  const { profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!churchId) {
      setEnabled(false);
      return;
    }
    getDoc(doc(db, "churches", churchId))
      .then((snap) => {
        if (!snap.exists()) {
          setEnabled(false);
          return;
        }
        const data = snap.data();
        const tier = (data.subscription_tier as SubscriptionTier) || "free";
        const overrides = data.feature_flags as Partial<FeatureFlags> | undefined;
        const flags = resolveFeatureFlags(tier, overrides);
        setEnabled(!!flags[feature]);
      })
      .catch(() => setEnabled(false));
  }, [churchId, feature]);

  // Don't render anything until we know the answer (avoids flash)
  if (enabled === null) return null;
  if (!enabled) return <>{fallback}</>;
  return <>{children}</>;
}

/**
 * useFeatureFlags — hook version for components that need multiple flags.
 */
export function useFeatureFlags(): FeatureFlags | null {
  const { profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;
  const [flags, setFlags] = useState<FeatureFlags | null>(null);

  useEffect(() => {
    if (!churchId) return;
    getDoc(doc(db, "churches", churchId))
      .then((snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const tier = (data.subscription_tier as SubscriptionTier) || "free";
        const overrides = data.feature_flags as Partial<FeatureFlags> | undefined;
        setFlags(resolveFeatureFlags(tier, overrides));
      })
      .catch(() => {});
  }, [churchId]);

  return flags;
}
