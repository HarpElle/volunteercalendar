"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TabItem {
  label: string;
  href: string;
  /** SVG path data for the icon (24x24 viewBox, strokeWidth 1.5) */
  iconPath: string;
  /** Show a coral notification dot */
  badge?: boolean;
}

interface MoreTabItem {
  label: string;
  action: "more";
  iconPath: string;
}

type Tab = TabItem | MoreTabItem;

export interface BottomNavProps {
  isAdmin: boolean;
  worshipEnabled: boolean;
  hasUnreadNotifications: boolean;
  onMoreOpen: () => void;
}

/* ------------------------------------------------------------------ */
/*  Tab definitions                                                    */
/* ------------------------------------------------------------------ */

const VOLUNTEER_TABS: TabItem[] = [
  {
    label: "Schedule",
    href: "/dashboard/my-schedule",
    iconPath:
      "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-1.5h.008v.008H12v-.008Z",
  },
  {
    label: "Dates",
    href: "/dashboard/my-availability",
    iconPath:
      "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
  {
    label: "Inbox",
    href: "/dashboard/notifications",
    iconPath:
      "M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0",
  },
  {
    label: "Account",
    href: "/dashboard/account",
    iconPath:
      "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
  },
];

function getAdminTabs(worshipEnabled: boolean): Tab[] {
  const tabs: Tab[] = [
    {
      label: "Home",
      href: "/dashboard",
      iconPath:
        "m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
    },
    {
      label: "Schedule",
      href: "/dashboard/schedules",
      iconPath:
        "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5",
    },
  ];

  if (worshipEnabled) {
    tabs.push({
      label: "Music",
      href: "/dashboard/worship/songs",
      iconPath:
        "m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z",
    });
  }

  tabs.push({
    label: "People",
    href: "/dashboard/people",
    iconPath:
      "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
  });

  tabs.push({
    label: "More",
    action: "more" as const,
    iconPath:
      "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5",
  });

  return tabs;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isMoreTab(tab: Tab): tab is MoreTabItem {
  return "action" in tab && tab.action === "more";
}

function isTabActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function BottomNav({
  isAdmin,
  worshipEnabled,
  hasUnreadNotifications,
  onMoreOpen,
}: BottomNavProps) {
  const pathname = usePathname();
  const tabs: Tab[] = isAdmin ? getAdminTabs(worshipEnabled) : VOLUNTEER_TABS;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-vc-border-light bg-white lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Mobile navigation"
    >
      <div className="flex">
        {tabs.map((tab) => {
          if (isMoreTab(tab)) {
            return (
              <button
                key="more"
                onClick={onMoreOpen}
                className="relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 text-vc-text-muted"
              >
                <svg
                  className="h-[22px] w-[22px]"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={tab.iconPath}
                  />
                </svg>
                <span className="text-[11px] font-medium leading-tight">
                  {tab.label}
                </span>
              </button>
            );
          }

          const active = isTabActive(tab.href, pathname);
          const showBadge =
            tab.href === "/dashboard/notifications" && hasUnreadNotifications;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 ${
                active ? "text-vc-indigo" : "text-vc-text-muted"
              }`}
            >
              {/* Active indicator — thin coral top bar */}
              {active && (
                <span className="absolute inset-x-2 top-0 h-[2px] rounded-full bg-vc-coral" />
              )}

              <span className="relative">
                <svg
                  className="h-[22px] w-[22px]"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={active ? 2 : 1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={tab.iconPath}
                  />
                </svg>
                {showBadge && (
                  <span className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-vc-coral" />
                )}
              </span>

              <span
                className={`text-[11px] leading-tight ${
                  active ? "font-semibold" : "font-medium"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
