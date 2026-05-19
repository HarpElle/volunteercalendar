"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TierLockBadge, useTierGate } from "@/components/dashboard/tier-lock";
import type { SubscriptionTier } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MoreMenuProps {
  open: boolean;
  onClose: () => void;
  subscriptionTier: SubscriptionTier;
  hasUnreadNotifications: boolean;
  /** Admin OR scheduler — sees operational modules (Service Day, Schedules,
   *  People, Rooms, Check-In, Worship Prep) and their workbenches. */
  isAdminShell: boolean;
  /** Owner/admin only — sees Settings module + Settings workbench + admin-
   *  only sub-pages like Feedback Triage, Onboarding, Retention. */
  isAdmin: boolean;
  /** Tier-enabled AND role-permitted for Check-In; mirrors the desktop
   *  sidebar's canAccessCheckin gate. */
  canAccessCheckin: boolean;
  hasPrerequisites: boolean;
  onSignOut: () => Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Icon helper                                                        */
/* ------------------------------------------------------------------ */

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      className={className || "h-5 w-5"}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const ICON = {
  home: "m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  serviceDay: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  schedules:
    "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5",
  people:
    "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
  rooms:
    "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
  checkin:
    "M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z",
  worship:
    "m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z",
  settings:
    "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z",
  help: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z",
  inbox:
    "M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0",
  myAvailability: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  myJourney:
    "M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342",
  myFeedback:
    "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z",
  myOrgs:
    "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z",
  account:
    "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
  signOut:
    "M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9",
} as const;

/* ------------------------------------------------------------------ */
/*  Section heading + row primitives                                   */
/* ------------------------------------------------------------------ */

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 pt-5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-vc-text-muted">
      {children}
    </p>
  );
}

function ModuleRow({
  href,
  label,
  iconPath,
  onClose,
  badge,
  locked,
  tierLabel,
  tierName,
}: {
  href: string;
  label: string;
  iconPath: string;
  onClose: () => void;
  badge?: boolean;
  locked?: boolean;
  tierLabel?: string;
  tierName?: string;
}) {
  if (locked) {
    // Visible focus ring + hover/focus tooltip so keyboard users on mobile
    // discover the upgrade hint (Codex Phase 1 Finding 3).
    const tierPretty = tierName
      ? tierName.charAt(0).toUpperCase() + tierName.slice(1)
      : "";
    const upgradeText = tierPretty ? `Available on ${tierPretty}.` : "Locked.";
    return (
      <div
        tabIndex={0}
        role="link"
        aria-disabled="true"
        aria-label={`${label} — locked. ${upgradeText}`}
        className="group relative flex items-center gap-3 px-5 py-3.5 text-sm font-medium text-vc-text-muted/70 focus-visible:outline-none focus-visible:bg-vc-sand/20"
      >
        <Icon d={iconPath} className="h-5 w-5 text-vc-text-muted/70" />
        <span className="flex-1 text-left">{label}</span>
        {tierLabel && <TierLockBadge tierLabel={tierLabel} />}
        <span
          role="tooltip"
          className="pointer-events-none absolute right-5 top-full z-50 mt-1 hidden whitespace-nowrap rounded-md bg-vc-indigo px-2 py-1 text-xs font-normal text-white shadow-lg group-hover:block group-focus-visible:block"
        >
          {upgradeText}
        </span>
      </div>
    );
  }
  return (
    <Link
      href={href}
      onClick={onClose}
      className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium text-vc-text-secondary active:bg-vc-sand/20"
    >
      <span className="relative">
        <Icon d={iconPath} className="h-5 w-5 text-vc-text-muted" />
        {badge && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-vc-coral" />
        )}
      </span>
      <span className="flex-1 text-left">{label}</span>
    </Link>
  );
}

function WorkbenchLink({
  href,
  label,
  onClose,
}: {
  href: string;
  label: string;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="block px-9 py-2.5 text-sm text-vc-text-secondary active:bg-vc-sand/20"
    >
      {label}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function MoreMenu({
  open,
  onClose,
  subscriptionTier,
  hasUnreadNotifications,
  isAdminShell,
  isAdmin,
  canAccessCheckin,
  hasPrerequisites,
  onSignOut,
}: MoreMenuProps) {
  const pathname = usePathname();

  const roomsGate = useTierGate("rooms", subscriptionTier);
  const checkinGate = useTierGate("checkin", subscriptionTier);
  const worshipGate = useTierGate("worship", subscriptionTier);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  // Close on route change
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30 lg:hidden"
        onClick={onClose}
        role="button"
        aria-label="Close menu"
      />

      {/* Sheet — scrollable, with bottom-fade affordance */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-vc-bg shadow-2xl lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Drag handle */}
        <div className="sticky top-0 z-10 flex justify-center bg-vc-bg py-3">
          <div className="h-1 w-10 rounded-full bg-vc-text-muted/30" />
        </div>

        {/* PRIMARY MODULES — mirrors desktop sidebar */}
        <SectionHeading>Primary modules</SectionHeading>
        <ModuleRow href="/dashboard" label="Home" iconPath={ICON.home} onClose={onClose} />
        {isAdminShell && (
          <ModuleRow
            href="/dashboard/scheduling-dashboard"
            label="Service Day"
            iconPath={ICON.serviceDay}
            onClose={onClose}
          />
        )}
        {isAdminShell && (
          <ModuleRow
            href="/dashboard/schedules"
            label="Schedules"
            iconPath={ICON.schedules}
            onClose={onClose}
          />
        )}
        {isAdminShell && (
          <ModuleRow
            href="/dashboard/people"
            label="People"
            iconPath={ICON.people}
            onClose={onClose}
          />
        )}
        {isAdminShell && (
          <ModuleRow
            href="/dashboard/rooms"
            label="Rooms"
            iconPath={ICON.rooms}
            onClose={onClose}
            locked={!roomsGate.enabled}
            tierLabel={roomsGate.badgeLabel}
            tierName={roomsGate.tierRequired}
          />
        )}
        {/* Check-In primary row — visible only if the user has check-in role
            (tier lock can still apply for showing the badge to admins who
            DO have the role but are on a tier that gates it). */}
        {isAdminShell && canAccessCheckin && (
          <ModuleRow
            href="/dashboard/checkin"
            label="Check-In"
            iconPath={ICON.checkin}
            onClose={onClose}
            locked={!checkinGate.enabled}
            tierLabel={checkinGate.badgeLabel}
            tierName={checkinGate.tierRequired}
          />
        )}
        {isAdminShell && (
          <ModuleRow
            href="/dashboard/worship/plans"
            label="Worship Prep"
            iconPath={ICON.worship}
            onClose={onClose}
            locked={!worshipGate.enabled}
            tierLabel={worshipGate.badgeLabel}
            tierName={worshipGate.tierRequired}
          />
        )}
        {/* Settings is admin-only (schedulers cannot edit org config). */}
        {isAdmin && (
          <ModuleRow
            href="/dashboard/settings"
            label="Settings"
            iconPath={ICON.settings}
            onClose={onClose}
          />
        )}

        {/* People workbench — schedulers see operational sub-pages; admin
            sub-items (Onboarding, Retention, Feedback Triage) further gated. */}
        {isAdminShell && (
          <>
            <SectionHeading>People workbench</SectionHeading>
            <WorkbenchLink href="/dashboard/people" label="Roster" onClose={onClose} />
            <WorkbenchLink href="/dashboard/org/teams" label="Teams" onClose={onClose} />
            <WorkbenchLink href="/dashboard/training-sessions" label="Training Sessions" onClose={onClose} />
            <WorkbenchLink href="/dashboard/volunteer-health" label="Health" onClose={onClose} />
            {isAdmin && (
              <>
                <WorkbenchLink href="/dashboard/onboarding" label="Onboarding" onClose={onClose} />
                <WorkbenchLink href="/dashboard/retention" label="Retention" onClose={onClose} />
                <WorkbenchLink href="/dashboard/admin/feedback" label="Feedback Triage" onClose={onClose} />
              </>
            )}
          </>
        )}

        {/* Rooms workbench */}
        {isAdminShell && roomsGate.enabled && (
          <>
            <SectionHeading>Rooms workbench</SectionHeading>
            <WorkbenchLink href="/dashboard/rooms" label="Bookings" onClose={onClose} />
            <WorkbenchLink href="/dashboard/rooms/requests" label="Requests" onClose={onClose} />
          </>
        )}

        {/* Check-In workbench — requires role permission AND tier */}
        {isAdminShell && checkinGate.enabled && canAccessCheckin && (
          <>
            <SectionHeading>Check-In workbench</SectionHeading>
            <WorkbenchLink href="/dashboard/checkin" label="Today" onClose={onClose} />
            <WorkbenchLink href="/dashboard/checkin/households" label="Households" onClose={onClose} />
            <WorkbenchLink href="/dashboard/checkin/reports" label="Reports" onClose={onClose} />
            {isAdmin && (
              <WorkbenchLink href="/dashboard/checkin/import" label="Import" onClose={onClose} />
            )}
          </>
        )}

        {/* Worship workbench */}
        {isAdminShell && worshipGate.enabled && (
          <>
            <SectionHeading>Worship workbench</SectionHeading>
            <WorkbenchLink href="/dashboard/worship/plans" label="Service Plans" onClose={onClose} />
            <WorkbenchLink href="/dashboard/worship/songs" label="Songs" onClose={onClose} />
            <WorkbenchLink href="/dashboard/worship/reports" label="Reports" onClose={onClose} />
          </>
        )}

        {/* Settings workbench (admin only — schedulers cannot edit org config) */}
        {isAdmin && (
          <>
            <SectionHeading>Settings workbench</SectionHeading>
            <WorkbenchLink href="/dashboard/settings" label="General" onClose={onClose} />
            <WorkbenchLink href="/dashboard/org/billing" label="Billing" onClose={onClose} />
            <WorkbenchLink href="/dashboard/org/activity" label="Activity" onClose={onClose} />
            <WorkbenchLink href="/dashboard/reminders" label="Reminders" onClose={onClose} />
            <WorkbenchLink href="/dashboard/short-links" label="Short Links" onClose={onClose} />
          </>
        )}

        {/* ME zone — personal pages for any role */}
        <SectionHeading>Me</SectionHeading>
        <ModuleRow
          href="/dashboard/my-schedule"
          label="My Schedule"
          iconPath={ICON.schedules}
          onClose={onClose}
        />
        <ModuleRow
          href="/dashboard/my-availability"
          label="My Availability"
          iconPath={ICON.myAvailability}
          onClose={onClose}
        />
        <ModuleRow
          href="/dashboard/inbox"
          label="Inbox"
          iconPath={ICON.inbox}
          onClose={onClose}
          badge={hasUnreadNotifications}
        />
        {hasPrerequisites && (
          <ModuleRow
            href="/dashboard/my-journey"
            label="My Journey"
            iconPath={ICON.myJourney}
            onClose={onClose}
          />
        )}
        <ModuleRow
          href="/dashboard/feedback"
          label="My Feedback"
          iconPath={ICON.myFeedback}
          onClose={onClose}
        />
        <ModuleRow
          href="/dashboard/account"
          label="Account"
          iconPath={ICON.account}
          onClose={onClose}
        />
        <ModuleRow
          href="/dashboard/my-orgs"
          label="My Organizations"
          iconPath={ICON.myOrgs}
          onClose={onClose}
        />

        <div className="mx-5 mt-4 border-t border-vc-border-light" />

        {/* Help + Sign Out */}
        <ModuleRow href="/dashboard/help" label="Help" iconPath={ICON.help} onClose={onClose} />
        <button
          onClick={async () => {
            onClose();
            await onSignOut();
          }}
          className="flex w-full items-center gap-3 px-5 py-3.5 text-sm font-medium text-vc-text-secondary active:bg-vc-sand/20"
        >
          <Icon d={ICON.signOut} className="h-5 w-5 text-vc-text-muted" />
          <span className="flex-1 text-left">Sign Out</span>
        </button>

        {/* Bottom safe area spacer */}
        <div className="h-4" />
      </div>
    </>
  );
}
