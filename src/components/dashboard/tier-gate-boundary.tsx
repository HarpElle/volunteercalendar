"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { useTierGate, type ModuleId } from "@/components/dashboard/tier-lock";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { isAdmin, isScheduler } from "@/lib/utils/permissions";
import type { SubscriptionTier, OrgRole } from "@/lib/types";

/**
 * Route-level tier gate. Wrap a module layout's children with this and
 * Free-tier visitors who hit a tier-locked URL directly will see an
 * upgrade-prompt screen instead of the actual module content.
 *
 * Sidebar / More-menu nav lock badges still work the same way; this is
 * purely the URL-level enforcement. Phase 6 Codex retest finding —
 * direct visits to /dashboard/worship etc were exposing usable
 * functionality despite the nav showing a lock badge.
 *
 * Implementation note: the component fetches the church doc to read
 * subscription_tier. Each tier-gated module layout pays one extra
 * Firestore read on entry; acceptable for the security benefit. A
 * future refactor could share tier via context if the read cost
 * matters in practice.
 */

const MODULE_LABEL: Record<ModuleId, string> = {
  rooms: "Rooms",
  checkin: "Children's Check-In",
  worship: "Worship Prep",
};

const MODULE_DESCRIPTION: Record<ModuleId, string> = {
  rooms:
    "Schedule rooms, manage facility groups, and publish a public room calendar so volunteers and partner orgs see who's where, when.",
  checkin:
    "Run kiosk-driven children's check-in with label printing, household management, and parent pickup confirmation.",
  worship:
    "Build service plans, manage your song library + chord charts, and run Stage Sync to coordinate your worship team in real time.",
};

export type RoleRequirement = "admin" | "scheduler" | "any";

export function TierGateBoundary({
  module,
  children,
  requiredRole = "scheduler",
}: {
  module: ModuleId;
  children: React.ReactNode;
  /**
   * Pass G Phase 6 hotfix: minimum role required to enter this module
   * subtree. Defaults to "scheduler" — admin+scheduler can enter
   * Worship/Rooms/Check-In; pure volunteers cannot. Pass "any" if the
   * module legitimately serves volunteers (none today).
   *
   * Codex Phase 6 sweep finding: previously this component only checked
   * tier. A volunteer in a Pro org could URL-hit /dashboard/worship and
   * see the operational UI. Now blocked.
   */
  requiredRole?: RoleRequirement;
}) {
  const { activeMembership, profile } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [tier, setTier] = useState<SubscriptionTier | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!churchId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "churches", churchId))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          setTier((snap.data().subscription_tier as SubscriptionTier) || "free");
        } else {
          setTier("free");
        }
      })
      .catch(() => {
        if (!cancelled) setTier("free");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [churchId]);

  // Always call the hook — using a fallback of "free" while tier is loading
  // means the gate stays closed during the brief loading window, which is
  // the safer default (no flash of unauthorized content).
  const gate = useTierGate(module, tier ?? "free");

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!gate.enabled) {
    return <LockedModuleScreen module={module} tierLabel={gate.badgeLabel} />;
  }

  // Tier passes — now check role. Volunteers shouldn't reach operational
  // modules via URL even if the tier is unlocked. Codex Phase 6 finding.
  if (requiredRole !== "any") {
    const hasRole =
      requiredRole === "admin"
        ? isAdmin(activeMembership)
        : isScheduler(activeMembership);
    if (!hasRole) {
      return (
        <AccessDeniedScreen
          module={module}
          memberRole={(activeMembership?.role as OrgRole | undefined) ?? null}
        />
      );
    }
  }

  return <>{children}</>;
}

function AccessDeniedScreen({
  module,
  memberRole,
}: {
  module: ModuleId;
  memberRole: OrgRole | null;
}) {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-vc-warning/10">
        <svg
          className="h-8 w-8 text-vc-warning"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.732 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>

      <h1 className="mb-2 font-display text-3xl text-vc-indigo">
        {MODULE_LABEL[module]}
      </h1>

      <p className="mb-6 text-sm text-vc-text-secondary">
        This area is for organization admins and schedulers.
        {memberRole ? ` Your current role is ${memberRole}.` : ""}{" "}
        Ask your church admin if you think you should have access.
      </p>

      <div className="flex flex-col items-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-vc-coral px-6 text-sm font-semibold text-white transition-colors hover:bg-vc-coral/90"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}

function LockedModuleScreen({
  module,
  tierLabel,
}: {
  module: ModuleId;
  tierLabel: string;
}) {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-vc-sand/40">
        <svg
          className="h-8 w-8 text-vc-text-muted"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      </div>

      <h1 className="mb-2 font-display text-3xl text-vc-indigo">
        {MODULE_LABEL[module]}
      </h1>

      <p className="mb-5 text-sm text-vc-text-secondary">
        {MODULE_DESCRIPTION[module]}
      </p>

      <div className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-vc-sand/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-vc-text-muted">
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
        Requires {tierLabel} tier
      </div>

      <div className="flex flex-col items-center gap-3">
        <Link
          href="/dashboard/settings/billing"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-vc-coral px-6 text-sm font-semibold text-white transition-colors hover:bg-vc-coral/90"
        >
          Upgrade to {tierLabel}
        </Link>
        <Link
          href="/dashboard"
          className="text-sm text-vc-text-muted underline underline-offset-2 hover:text-vc-indigo"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
