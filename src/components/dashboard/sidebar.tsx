"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { isAdmin, isScheduler } from "@/lib/utils/permissions";
import { canAccessCheckin } from "@/lib/utils/checkin-permissions";
import { Avatar } from "@/components/ui/avatar";
import type { Membership } from "@/lib/types";

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
/*  Nav structure                                                      */
/* ------------------------------------------------------------------ */

interface NavItem {
  label: string;
  href: string;
  iconPath: string;
  gate?: (m: Membership | null) => boolean;
}

interface NavSection {
  label: string | null;
  items: NavItem[];
  gate?: (m: Membership | null) => boolean;
  /** Sections that collapse by default (Check-In, Rooms) */
  collapsible?: boolean;
  /** localStorage key for persisting collapsed state */
  collapseKey?: string;
}

function getNavSections(
  worshipEnabled: boolean,
  checkinEnabled: boolean,
  roomsEnabled: boolean,
): NavSection[] {
  return [
    /* ── Home ── */
    {
      label: "HOME",
      items: [
        {
          label: "Dashboard",
          href: "/dashboard",
          iconPath:
            "m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
          gate: (m) => isAdmin(m),
        },
      ],
    },

    /* ── Schedule ── */
    {
      label: "SCHEDULE",
      gate: (m) => isScheduler(m),
      items: [
        {
          label: "Schedules",
          href: "/dashboard/schedules",
          iconPath:
            "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5",
          gate: (m) => isScheduler(m),
        },
        {
          label: "Services & Events",
          href: "/dashboard/services-events",
          iconPath:
            "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
          gate: (m) => isAdmin(m),
        },
        {
          label: "Live Status",
          href: "/dashboard/scheduling-dashboard",
          iconPath:
            "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z",
          gate: (m) => isScheduler(m),
        },
      ],
    },

    /* ── Worship (tier-gated) ── */
    ...(worshipEnabled
      ? [
          {
            label: "WORSHIP",
            gate: (m: Membership | null) => isAdmin(m),
            items: [
              {
                label: "Songs",
                href: "/dashboard/worship/songs",
                iconPath:
                  "m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z",
                gate: (m: Membership | null) => isAdmin(m),
              },
              {
                label: "Service Plans",
                href: "/dashboard/worship/plans",
                iconPath:
                  "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z",
                gate: (m: Membership | null) => isAdmin(m),
              },
            ],
          },
        ]
      : []),

    /* ── People ── */
    {
      label: "PEOPLE",
      gate: (m) => isScheduler(m),
      items: [
        {
          label: "Volunteers",
          href: "/dashboard/people",
          iconPath:
            "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
          gate: (m) => isScheduler(m),
        },
        {
          label: "Team Health",
          href: "/dashboard/volunteer-health",
          iconPath:
            "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z",
          gate: (m) => isScheduler(m),
        },
        {
          label: "Onboarding",
          href: "/dashboard/onboarding",
          iconPath:
            "M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342",
          gate: (m) => isAdmin(m),
        },
      ],
    },

    /* ── Check-In (tier-gated, collapsible) ── */
    ...(checkinEnabled
      ? [
          {
            label: "CHILDREN'S CHECK-IN",
            gate: (m: Membership | null) => !!m && canAccessCheckin(m),
            collapsible: true,
            collapseKey: "vc_sidebar_checkin",
            items: [
              {
                label: "Dashboard",
                href: "/dashboard/checkin",
                iconPath:
                  "M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z",
                gate: (m: Membership | null) => !!m && canAccessCheckin(m),
              },
              {
                label: "Households",
                href: "/dashboard/checkin/households",
                iconPath:
                  "M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z",
                gate: (m: Membership | null) => !!m && canAccessCheckin(m),
              },
            ],
          },
        ]
      : []),

    /* ── Rooms (tier-gated, collapsible) ── */
    ...(roomsEnabled
      ? [
          {
            label: "ROOMS",
            gate: (m: Membership | null) => isScheduler(m),
            collapsible: true,
            collapseKey: "vc_sidebar_rooms",
            items: [
              {
                label: "Bookings",
                href: "/dashboard/rooms",
                iconPath:
                  "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
                gate: (m: Membership | null) => isScheduler(m),
              },
              {
                label: "Requests",
                href: "/dashboard/rooms/requests",
                iconPath:
                  "M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z",
                gate: (m: Membership | null) => isAdmin(m),
              },
            ],
          },
        ]
      : []),
  ];
}

/* ------------------------------------------------------------------ */
/*  Sidebar props                                                      */
/* ------------------------------------------------------------------ */

export interface SidebarProps {
  activeMembership: Membership | null;
  worshipEnabled: boolean;
  checkinEnabled: boolean;
  roomsEnabled: boolean;
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
  signOut: () => Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Collapsible Section                                                */
/* ------------------------------------------------------------------ */

function CollapsibleSection({
  label,
  collapseKey,
  children,
  pathname,
  sectionHrefs,
}: {
  label: string;
  collapseKey: string;
  children: React.ReactNode;
  pathname: string;
  sectionHrefs: string[];
}) {
  // Auto-expand if the current route is inside this section
  const isInSection = sectionHrefs.some(
    (href) => pathname === href || pathname.startsWith(href + "/"),
  );

  const [expanded, setExpanded] = useState(() => {
    if (isInSection) return true;
    if (typeof window !== "undefined") {
      return localStorage.getItem(collapseKey) === "1";
    }
    return false;
  });

  useEffect(() => {
    if (isInSection && !expanded) setExpanded(true);
  }, [isInSection]);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    localStorage.setItem(collapseKey, next ? "1" : "0");
  }

  return (
    <div>
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-3 pt-5 pb-1.5"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-vc-text-muted">
          {label}
        </span>
        <svg
          className={`h-3.5 w-3.5 text-vc-text-muted transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m19.5 8.25-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          expanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="space-y-1 pt-1">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Sidebar({
  activeMembership,
  worshipEnabled,
  checkinEnabled,
  roomsEnabled,
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
  signOut,
}: SidebarProps) {
  const pathname = usePathname();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const hasMultipleOrgs = activeMemberships.length > 1;

  // Close menu when clicking outside
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

  // Build and filter nav sections
  const navSections = getNavSections(worshipEnabled, checkinEnabled, roomsEnabled);
  const visibleSections = navSections
    .map((section) => {
      if (section.gate && !section.gate(activeMembership)) return null;
      const visibleItems = section.items.filter(
        (item) => !item.gate || item.gate(activeMembership),
      );
      if (visibleItems.length === 0) return null;
      return { ...section, items: visibleItems };
    })
    .filter(Boolean) as NavSection[];

  // Separate primary sections from collapsible ones
  const primarySections = visibleSections.filter((s) => !s.collapsible);
  const collapsibleSections = visibleSections.filter((s) => s.collapsible);

  async function handleSignOut() {
    setAccountMenuOpen(false);
    await signOut();
  }

  function renderNavItem(item: NavItem) {
    const isActive =
      pathname === item.href ||
      (item.href !== "/dashboard" && pathname.startsWith(item.href));

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? "border-l-[3px] border-vc-coral bg-vc-coral/8 pl-[9px] text-vc-indigo"
            : "text-vc-text-secondary hover:bg-vc-sand/20 hover:text-vc-indigo"
        }`}
      >
        <Icon
          d={item.iconPath}
          className={`h-5 w-5 ${isActive ? "text-vc-indigo" : "text-vc-text-muted"}`}
        />
        {item.label}
        {item.href === "/dashboard" && showGuideDot && (
          <span
            className="ml-auto h-2 w-2 rounded-full bg-vc-coral"
            title="Setup guide available"
          />
        )}
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
      </div>

      {/* Nav sections */}
      <nav
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"
        aria-label="Dashboard navigation"
      >
        {/* Primary nav sections */}
        {primarySections.map((section, sIdx) => (
          <div key={sIdx}>
            {section.label && (
              <p className="px-3 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-vc-text-muted">
                {section.label}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map(renderNavItem)}
            </div>
          </div>
        ))}

        {/* Divider before collapsible sections */}
        {collapsibleSections.length > 0 && (
          <div className="mx-3 mt-4 border-t border-vc-border-light" />
        )}

        {/* Collapsible sections (Check-In, Rooms) */}
        {collapsibleSections.map((section) => (
          <CollapsibleSection
            key={section.label}
            label={section.label!}
            collapseKey={section.collapseKey!}
            pathname={pathname}
            sectionHrefs={section.items.map((i) => i.href)}
          >
            {section.items.map(renderNavItem)}
          </CollapsibleSection>
        ))}

        {/* Divider before bottom items */}
        <div className="mx-3 mt-4 border-t border-vc-border-light" />

        {/* My Schedule + Notifications + Help */}
        <div className="mt-3 space-y-1">
          <Link
            href="/dashboard/my-schedule"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname.startsWith("/dashboard/my-schedule")
                ? "border-l-[3px] border-vc-coral bg-vc-coral/8 pl-[9px] text-vc-indigo"
                : "text-vc-text-secondary hover:bg-vc-sand/20 hover:text-vc-indigo"
            }`}
          >
            <Icon
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z"
              className={`h-5 w-5 ${
                pathname.startsWith("/dashboard/my-schedule")
                  ? "text-vc-indigo"
                  : "text-vc-text-muted"
              }`}
            />
            My Schedule
          </Link>
          <Link
            href="/dashboard/inbox"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname.startsWith("/dashboard/inbox")
                ? "border-l-[3px] border-vc-coral bg-vc-coral/8 pl-[9px] text-vc-indigo"
                : "text-vc-text-secondary hover:bg-vc-sand/20 hover:text-vc-indigo"
            }`}
          >
            <span className="relative">
              <Icon
                d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
                className={`h-5 w-5 ${
                  pathname.startsWith("/dashboard/inbox")
                    ? "text-vc-indigo"
                    : "text-vc-text-muted"
                }`}
              />
              {hasUnreadNotifications && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-vc-coral" />
              )}
            </span>
            Inbox
          </Link>
          {isScheduler(activeMembership) && (
            <Link
              href="/dashboard/reminders"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                pathname.startsWith("/dashboard/reminders")
                  ? "border-l-[3px] border-vc-coral bg-vc-coral/8 pl-[9px] text-vc-indigo"
                  : "text-vc-text-secondary hover:bg-vc-sand/20 hover:text-vc-indigo"
              }`}
            >
              <Icon
                d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38a1.125 1.125 0 0 1-1.54-.413l-.34-.59a9.867 9.867 0 0 1-.985-2.783m2.91-9.09a9.868 9.868 0 0 1 .985-2.783l.34-.59a1.125 1.125 0 0 1 1.54-.413l.657.38c.524.3.71.96.463 1.51a9.866 9.866 0 0 0-.985 2.783m-2.91 9.09h2.91"
                className={`h-5 w-5 ${
                  pathname.startsWith("/dashboard/reminders")
                    ? "text-vc-indigo"
                    : "text-vc-text-muted"
                }`}
              />
              Send Reminders
            </Link>
          )}
          <Link
            href="/dashboard/help"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname.startsWith("/dashboard/help")
                ? "border-l-[3px] border-vc-coral bg-vc-coral/8 pl-[9px] text-vc-indigo"
                : "text-vc-text-secondary hover:bg-vc-sand/20 hover:text-vc-indigo"
            }`}
          >
            <Icon
              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
              className={`h-5 w-5 ${
                pathname.startsWith("/dashboard/help")
                  ? "text-vc-indigo"
                  : "text-vc-text-muted"
              }`}
            />
            Help
          </Link>
          {isAdmin(activeMembership) && (
            <Link
              href="/dashboard/settings"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                pathname.startsWith("/dashboard/settings")
                  ? "border-l-[3px] border-vc-coral bg-vc-coral/8 pl-[9px] text-vc-indigo"
                  : "text-vc-text-secondary hover:bg-vc-sand/20 hover:text-vc-indigo"
              }`}
            >
              <Icon
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
                className={`h-5 w-5 ${
                  pathname.startsWith("/dashboard/settings")
                    ? "text-vc-indigo"
                    : "text-vc-text-muted"
                }`}
              />
              Settings
            </Link>
          )}
        </div>
      </nav>

      {/* Bottom pinned area — merged account card */}
      <div className="mt-auto shrink-0">
        <div className="relative border-t border-vc-border-light px-3 py-3" ref={accountMenuRef}>
          {/* Merged popover */}
          {accountMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border border-vc-border-light bg-white shadow-lg">
              {/* Header: name + email */}
              <div className="border-b border-vc-border-light px-4 py-3">
                <p className="truncate text-sm font-medium text-vc-indigo">
                  {displayName}
                </p>
                <p className="truncate text-xs text-vc-text-muted">{email}</p>
              </div>

              {/* Org switcher (multi-org only) */}
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
                        {isCurrent && (
                          <svg
                            className="ml-auto h-4 w-4 shrink-0 text-vc-coral"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m4.5 12.75 6 6 9-13.5"
                            />
                          </svg>
                        )}
                        {!isCurrent && (
                          <span className="ml-auto text-xs capitalize text-vc-text-muted">
                            {m.role}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Links */}
              <div className="py-1">
                <Link
                  href="/dashboard/account"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-vc-text-secondary transition-colors hover:bg-vc-bg-warm hover:text-vc-indigo"
                >
                  <Icon
                    d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                    className="h-4 w-4"
                  />
                  Account Settings
                </Link>
                <Link
                  href="/dashboard/my-orgs"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-vc-text-secondary transition-colors hover:bg-vc-bg-warm hover:text-vc-indigo"
                >
                  <Icon
                    d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z"
                    className="h-4 w-4"
                  />
                  My Organizations
                </Link>
              </div>

              {/* Sign out */}
              <div className="border-t border-vc-border-light py-1">
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-vc-text-secondary transition-colors hover:bg-vc-bg-warm hover:text-vc-indigo"
                >
                  <Icon
                    d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
                    className="h-4 w-4"
                  />
                  Sign out
                </button>
              </div>
            </div>
          )}

          {/* Merged trigger button */}
          <button
            onClick={() => setAccountMenuOpen(!accountMenuOpen)}
            className="flex w-full items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-vc-sand/20"
          >
            <Avatar
              name={displayName || email || "?"}
              photoUrl={userPhotoUrl}
              size="sm"
            />
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium text-vc-indigo">
                {displayName}
              </p>
              <p className="truncate text-xs text-vc-text-muted">
                {churchName || "No Organization"}
              </p>
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m4.5 15.75 7.5-7.5 7.5 7.5"
              />
            </svg>
          </button>
        </div>

        {/* HarpElle sub-brand attribution */}
        <p className="py-2 text-center text-[11px] text-vc-text-muted">
          a HarpElle app
        </p>
      </div>
    </aside>
  );
}
