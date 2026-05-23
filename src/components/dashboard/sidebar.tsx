"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { isAdmin, isScheduler } from "@/lib/utils/permissions";
import { shouldShowCheckinNav } from "@/lib/utils/checkin-permissions";
import { Avatar } from "@/components/ui/avatar";
import { TierLockBadge, useTierGate, type ModuleId } from "@/components/dashboard/tier-lock";
import type { Membership, SubscriptionTier } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Icon helpers                                                       */
/* ------------------------------------------------------------------ */

const Icon = ({ d, className }: { d: string; className?: string }) => (
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

/* ------------------------------------------------------------------ */
/*  Nav item type                                                      */
/* ------------------------------------------------------------------ */

interface NavItem {
  label: string;
  href: string;
  iconPath: string;
  /** Show a notification dot on the icon */
  badge?: boolean;
  /** Tier-gated module ID (sidebar shows lock badge + disabled state when not enabled) */
  tierModule?: ModuleId;
}

/* ------------------------------------------------------------------ */
/*  Icon paths (constants — pulled out of getter for clarity)          */
/* ------------------------------------------------------------------ */

const ICON = {
  home: "m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  serviceDay:
    "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
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
  myAvailability:
    "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
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
  platform:
    "M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6",
} as const;

/* ------------------------------------------------------------------ */
/*  Item builders                                                      */
/* ------------------------------------------------------------------ */

function getAdminItems(): NavItem[] {
  // Phase 1 transition: links point at current routes. Phase 2/3 update the targets.
  return [
    { label: "Home", href: "/dashboard", iconPath: ICON.home },
    { label: "Service Day", href: "/dashboard/service-day", iconPath: ICON.serviceDay },
    { label: "Schedules", href: "/dashboard/schedules", iconPath: ICON.schedules },
    { label: "People", href: "/dashboard/people", iconPath: ICON.people },
    { label: "Rooms", href: "/dashboard/rooms", iconPath: ICON.rooms, tierModule: "rooms" },
    { label: "Check-In", href: "/dashboard/checkin", iconPath: ICON.checkin, tierModule: "checkin" },
    { label: "Worship Prep", href: "/dashboard/worship", iconPath: ICON.worship, tierModule: "worship" },
  ];
}

function getVolunteerItems(hasPrerequisites: boolean, hasUnread: boolean): NavItem[] {
  const items: NavItem[] = [
    { label: "Schedule", href: "/dashboard/my-schedule", iconPath: ICON.schedules },
    { label: "Availability", href: "/dashboard/my-availability", iconPath: ICON.myAvailability },
    { label: "Inbox", href: "/dashboard/inbox", iconPath: ICON.inbox, badge: hasUnread },
  ];
  if (hasPrerequisites) {
    items.push({ label: "My Journey", href: "/dashboard/my-journey", iconPath: ICON.myJourney });
  }
  return items;
}

function getPlatformItems(): NavItem[] {
  return [
    { label: "Overview", href: "/dashboard/platform", iconPath: ICON.platform },
    { label: "Feedback", href: "/dashboard/platform/feedback", iconPath: ICON.myFeedback },
    { label: "Organizations", href: "/dashboard/platform/orgs", iconPath: ICON.myOrgs },
  ];
}

/* ------------------------------------------------------------------ */
/*  Sidebar props                                                      */
/* ------------------------------------------------------------------ */

export interface SidebarProps {
  activeMembership: Membership | null;
  subscriptionTier: SubscriptionTier;
  showGuideDot: boolean;
  hasUnreadNotifications?: boolean;
  // Org data
  churchName: string;
  churchId: string | undefined;
  activeMemberships: Membership[];
  orgNames: Map<string, string>;
  switchOrg: (churchId: string) => void;
  // User data
  displayName: string;
  email: string;
  userPhotoUrl?: string | null;
  hasPrerequisites?: boolean;
  signOut: () => Promise<void>;
  isPlatformAdmin?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Sidebar({
  activeMembership,
  subscriptionTier,
  showGuideDot,
  hasUnreadNotifications,
  churchName,
  churchId,
  activeMemberships,
  orgNames,
  switchOrg,
  displayName,
  email,
  userPhotoUrl,
  hasPrerequisites,
  signOut,
  isPlatformAdmin,
}: SidebarProps) {
  const pathname = usePathname();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const hasMultipleOrgs = activeMemberships.length > 1;
  const userIsAdmin = isAdmin(activeMembership);
  const userIsScheduler = isScheduler(activeMembership);
  // Use shouldShowCheckinNav (stricter than canAccessCheckin): schedulers
  // need the explicit checkin_volunteer flag to see Check-In in nav.
  // Page-level access still uses canAccessCheckin (permissive) elsewhere.
  const userCanAccessCheckin = !!activeMembership && shouldShowCheckinNav(activeMembership);

  // Tier gates per module
  const roomsGate = useTierGate("rooms", subscriptionTier);
  const checkinGate = useTierGate("checkin", subscriptionTier);
  const worshipGate = useTierGate("worship", subscriptionTier);

  function tierGateFor(moduleId: ModuleId | undefined) {
    if (moduleId === "rooms") return roomsGate;
    if (moduleId === "checkin") return checkinGate;
    if (moduleId === "worship") return worshipGate;
    return null;
  }

  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(e.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    }
    if (accountMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [accountMenuOpen]);

  async function handleSignOut() {
    setAccountMenuOpen(false);
    await signOut();
  }

  // Decide which item list to render
  const isVolunteerOnly = !!activeMembership && !userIsScheduler;
  const primaryItems = isVolunteerOnly
    ? getVolunteerItems(!!hasPrerequisites, !!hasUnreadNotifications)
    : getAdminItems();

  function renderNavItem(item: NavItem) {
    const gate = tierGateFor(item.tierModule);
    const locked = gate ? !gate.enabled : false;

    // Check-In is also role-gated (only members with check-in role/admin)
    if (item.tierModule === "checkin" && !userCanAccessCheckin) {
      return null;
    }

    const isActive = !locked && (
      pathname === item.href ||
      (item.href !== "/dashboard" && pathname.startsWith(item.href))
    );

    const baseClass = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors";
    const activeClass = "border-l-[3px] border-vc-coral bg-vc-coral/8 pl-[9px] text-vc-indigo";
    const idleClass = "text-vc-text-secondary hover:bg-vc-sand/20 hover:text-vc-indigo";
    // Locked: muted, not-allowed cursor, AND a visible focus ring + hoverable
    // tooltip below the row that also shows on keyboard focus-visible
    // (Codex Phase 1 Finding 3).
    const lockedClass = "text-vc-text-muted/70 cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vc-coral/40 hover:bg-vc-sand/10";

    const content = (
      <>
        {item.badge ? (
          <span className="relative">
            <Icon
              d={item.iconPath}
              className={`h-5 w-5 ${isActive ? "text-vc-indigo" : "text-vc-text-muted"}`}
            />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-vc-coral" />
          </span>
        ) : (
          <Icon
            d={item.iconPath}
            className={`h-5 w-5 ${isActive ? "text-vc-indigo" : "text-vc-text-muted"}`}
          />
        )}
        <span>{item.label}</span>
        {item.href === "/dashboard" && showGuideDot && !locked && (
          <span
            className="ml-auto h-2 w-2 rounded-full bg-vc-coral"
            title="Setup guide available"
          />
        )}
        {locked && gate && <TierLockBadge tierLabel={gate.badgeLabel} />}
      </>
    );

    if (locked) {
      // Tooltip-on-focus pattern; aria-disabled keeps it tab-focusable
      // for keyboard-discoverable upgrade info (per Codex review note).
      // Tooltip is a child popover that appears on group-hover AND
      // group-focus-visible so keyboard users see the upgrade hint too.
      const tierName = gate?.tierRequired ?? "";
      const upgradeText = `Available on ${tierName.charAt(0).toUpperCase()}${tierName.slice(1)}. Upgrade in Settings.`;
      // Tooltip is positioned BELOW the row (not to the right) because the
      // sidebar's `overflow-y-auto` implicitly clips overflow-x too, so
      // tooltips pointing right got hidden at the sidebar's right edge
      // (Codex Phase 1 v3 retest Finding 2). Below-the-row stays inside
      // the sidebar's horizontal bounds and only overlaps adjacent nav
      // rows briefly during hover/focus, which is acceptable.
      return (
        <div
          key={item.href}
          tabIndex={0}
          role="link"
          aria-disabled="true"
          aria-label={`${item.label} — locked. ${upgradeText}`}
          className={`${baseClass} ${lockedClass} group relative`}
        >
          {content}
          <span
            role="tooltip"
            className="pointer-events-none absolute left-3 top-full z-50 mt-1 max-w-[220px] whitespace-normal rounded-md bg-vc-indigo px-2 py-1 text-xs font-normal text-white shadow-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {upgradeText}
          </span>
        </div>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`${baseClass} ${isActive ? activeClass : idleClass}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-col lg:border-r lg:border-vc-border-light lg:bg-vc-bg-warm">
      {/* Sidebar header — brand mark */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-vc-indigo">
            <svg
              className="h-4 w-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
              />
            </svg>
          </div>
          <span className="text-lg font-semibold text-vc-indigo">
            Volunteer<span className="text-vc-coral">Cal</span>
          </span>
        </div>
        {/* Active-org context line for multi-org users */}
        {hasMultipleOrgs && churchName && (
          <button
            onClick={() => setAccountMenuOpen(true)}
            className="mt-2 flex w-full items-center gap-1 truncate text-left text-xs text-vc-text-muted hover:text-vc-indigo transition-colors"
            aria-label="Switch organization"
          >
            <span className="truncate">{churchName}</span>
            <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"
        aria-label="Dashboard navigation"
      >
        {/* Platform section (super-admin only) */}
        {isPlatformAdmin && (
          <>
            <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-vc-text-muted">
              Platform
            </p>
            <div className="space-y-1">{getPlatformItems().map(renderNavItem)}</div>
            <div className="mx-3 my-3 border-t border-vc-border-light" />
          </>
        )}

        {/* Primary modules — flat list, no group label, no collapsibles */}
        <div className="space-y-1 pt-2">{primaryItems.map(renderNavItem)}</div>

        {/* Divider before Settings + Help */}
        <div className="mx-3 mt-4 border-t border-vc-border-light" />

        {/* Settings (admin only) */}
        {userIsAdmin && (
          <div className="mt-3 space-y-1">
            {renderNavItem({
              label: "Settings",
              href: "/dashboard/settings",
              iconPath: ICON.settings,
            })}
          </div>
        )}

        {/* Help */}
        <div className={userIsAdmin ? "space-y-1" : "mt-3 space-y-1"}>
          {renderNavItem({
            label: "Help",
            href: "/dashboard/help",
            iconPath: ICON.help,
          })}
        </div>
      </nav>

      {/* Bottom pinned area — account widget */}
      <div className="mt-auto shrink-0">
        <div className="relative border-t border-vc-border-light px-3 py-3" ref={accountMenuRef}>
          {/* Popover panel */}
          {accountMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border border-vc-border-light bg-white shadow-lg">
              {/* Header */}
              <div className="border-b border-vc-border-light px-4 py-3">
                <p className="truncate text-sm font-medium text-vc-indigo">{displayName}</p>
                <p className="truncate text-xs text-vc-text-muted">{email}</p>
              </div>

              {/* Org switcher */}
              {hasMultipleOrgs && (
                <div className="border-b border-vc-border-light py-1">
                  <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-vc-text-muted">
                    Switch Organization
                  </p>
                  {activeMemberships.map((m) => {
                    const name =
                      m.church_id === churchId
                        ? churchName
                        : orgNames.get(m.church_id) || m.church_id;
                    const isCurrent = m.church_id === churchId;
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          switchOrg(m.church_id);
                          setAccountMenuOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors ${
                          isCurrent
                            ? "font-medium text-vc-coral"
                            : "text-vc-text-secondary hover:bg-vc-bg-warm hover:text-vc-indigo"
                        }`}
                      >
                        <span className="truncate">{name}</span>
                        {isCurrent ? (
                          <svg
                            className="ml-auto h-4 w-4 shrink-0 text-vc-coral"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        ) : (
                          <span className="ml-auto text-xs capitalize text-vc-text-muted">{m.role}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Me zone — admins reach personal pages here; volunteers see the same shortcuts */}
              {!isVolunteerOnly && (
                <div className="border-b border-vc-border-light py-1">
                  <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-vc-text-muted">
                    Me
                  </p>
                  <Link
                    href="/dashboard/my-schedule"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-sm text-vc-text-secondary transition-colors hover:bg-vc-bg-warm hover:text-vc-indigo"
                  >
                    <Icon d={ICON.schedules} className="h-4 w-4" />
                    My Schedule
                  </Link>
                  <Link
                    href="/dashboard/my-availability"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-sm text-vc-text-secondary transition-colors hover:bg-vc-bg-warm hover:text-vc-indigo"
                  >
                    <Icon d={ICON.myAvailability} className="h-4 w-4" />
                    My Availability
                  </Link>
                  <Link
                    href="/dashboard/inbox"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-sm text-vc-text-secondary transition-colors hover:bg-vc-bg-warm hover:text-vc-indigo"
                  >
                    <span className="relative">
                      <Icon d={ICON.inbox} className="h-4 w-4" />
                      {hasUnreadNotifications && (
                        <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-vc-coral" />
                      )}
                    </span>
                    Inbox
                  </Link>
                  <Link
                    href="/dashboard/feedback"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-sm text-vc-text-secondary transition-colors hover:bg-vc-bg-warm hover:text-vc-indigo"
                  >
                    <Icon d={ICON.myFeedback} className="h-4 w-4" />
                    My Feedback
                  </Link>
                </div>
              )}

              {/* Volunteer-only popover also gets My Feedback */}
              {isVolunteerOnly && (
                <div className="border-b border-vc-border-light py-1">
                  <Link
                    href="/dashboard/feedback"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-sm text-vc-text-secondary transition-colors hover:bg-vc-bg-warm hover:text-vc-indigo"
                  >
                    <Icon d={ICON.myFeedback} className="h-4 w-4" />
                    My Feedback
                  </Link>
                </div>
              )}

              {/* Account + My Organizations */}
              <div className="py-1">
                <Link
                  href="/dashboard/account"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-vc-text-secondary transition-colors hover:bg-vc-bg-warm hover:text-vc-indigo"
                >
                  <Icon d={ICON.account} className="h-4 w-4" />
                  Account Settings
                </Link>
                <Link
                  href="/dashboard/my-orgs"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-vc-text-secondary transition-colors hover:bg-vc-bg-warm hover:text-vc-indigo"
                >
                  <Icon d={ICON.myOrgs} className="h-4 w-4" />
                  My Organizations
                </Link>
              </div>

              {/* Sign out */}
              <div className="border-t border-vc-border-light py-1">
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-vc-text-secondary transition-colors hover:bg-vc-bg-warm hover:text-vc-indigo"
                >
                  <Icon d={ICON.signOut} className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}

          {/* Trigger */}
          <button
            onClick={() => setAccountMenuOpen(!accountMenuOpen)}
            className="flex w-full items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-vc-sand/20"
          >
            <Avatar name={displayName || email || "?"} photoUrl={userPhotoUrl} size="sm" />
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium text-vc-indigo">{displayName}</p>
              <p className="truncate text-xs text-vc-text-muted">{churchName || "No Organization"}</p>
              {activeMembership?.role && (
                <p className="truncate text-xs text-vc-text-muted/70">
                  {activeMembership.role.charAt(0).toUpperCase() + activeMembership.role.slice(1)}
                </p>
              )}
            </div>
            <svg
              className={`h-4 w-4 shrink-0 text-vc-text-muted transition-transform ${
                accountMenuOpen ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
            </svg>
          </button>
        </div>

        {/* HarpElle sub-brand attribution */}
        <p className="py-2 text-center text-[11px] text-vc-text-muted">a HarpElle app</p>
      </div>
    </aside>
  );
}
