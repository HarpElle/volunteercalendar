"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MoreMenuProps {
  open: boolean;
  onClose: () => void;
  checkinEnabled: boolean;
  roomsEnabled: boolean;
  worshipEnabled: boolean;
  hasUnreadNotifications: boolean;
  isAdmin: boolean;
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

/* ------------------------------------------------------------------ */
/*  Expandable section                                                 */
/* ------------------------------------------------------------------ */

function ExpandableSection({
  label,
  iconPath,
  children,
}: {
  label: string;
  iconPath: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-sm font-medium text-vc-text-secondary transition-colors active:bg-vc-sand/20"
      >
        <Icon d={iconPath} className="h-5 w-5 text-vc-text-muted" />
        <span className="flex-1 text-left">{label}</span>
        <svg
          className={`h-4 w-4 text-vc-text-muted transition-transform duration-200 ${
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
          expanded ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="pb-1 pl-8">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function MoreMenu({
  open,
  onClose,
  checkinEnabled,
  roomsEnabled,
  worshipEnabled,
  hasUnreadNotifications,
  isAdmin,
  onSignOut,
}: MoreMenuProps) {
  const pathname = usePathname();

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

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-vc-bg shadow-2xl lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3">
          <div className="h-1 w-10 rounded-full bg-vc-text-muted/30" />
        </div>

        {/* Tier-gated sections */}
        {checkinEnabled && (
          <ExpandableSection
            label="Check-In"
            iconPath="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"
          >
            <Link
              href="/dashboard/checkin"
              onClick={onClose}
              className="block px-5 py-2.5 text-sm text-vc-text-secondary active:bg-vc-sand/20"
            >
              Dashboard
            </Link>
            <Link
              href="/dashboard/checkin/households"
              onClick={onClose}
              className="block px-5 py-2.5 text-sm text-vc-text-secondary active:bg-vc-sand/20"
            >
              Households
            </Link>
          </ExpandableSection>
        )}

        {worshipEnabled && isAdmin && (
          <ExpandableSection
            label="Worship"
            iconPath="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z"
          >
            <Link
              href="/dashboard/worship/plans"
              onClick={onClose}
              className="block px-5 py-2.5 text-sm text-vc-text-secondary active:bg-vc-sand/20"
            >
              Service Plans
            </Link>
            <Link
              href="/dashboard/worship/songs"
              onClick={onClose}
              className="block px-5 py-2.5 text-sm text-vc-text-secondary active:bg-vc-sand/20"
            >
              Songs
            </Link>
          </ExpandableSection>
        )}

        {roomsEnabled && (
          <ExpandableSection
            label="Rooms"
            iconPath="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
          >
            <Link
              href="/dashboard/rooms"
              onClick={onClose}
              className="block px-5 py-2.5 text-sm text-vc-text-secondary active:bg-vc-sand/20"
            >
              Bookings
            </Link>
            <Link
              href="/dashboard/rooms/requests"
              onClick={onClose}
              className="block px-5 py-2.5 text-sm text-vc-text-secondary active:bg-vc-sand/20"
            >
              Requests
            </Link>
          </ExpandableSection>
        )}

        {(checkinEnabled || roomsEnabled || worshipEnabled) && (
          <div className="mx-5 border-t border-vc-border-light" />
        )}

        {/* Standard items */}
        <Link
          href="/dashboard/inbox"
          onClick={onClose}
          className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium text-vc-text-secondary active:bg-vc-sand/20"
        >
          <span className="relative">
            <Icon
              d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
              className="h-5 w-5 text-vc-text-muted"
            />
            {hasUnreadNotifications && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-vc-coral" />
            )}
          </span>
          Inbox
        </Link>

        <Link
          href="/dashboard/reminders"
          onClick={onClose}
          className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium text-vc-text-secondary active:bg-vc-sand/20"
        >
          <Icon
            d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38a1.125 1.125 0 0 1-1.54-.413l-.34-.59a9.867 9.867 0 0 1-.985-2.783m2.91-9.09a9.868 9.868 0 0 1 .985-2.783l.34-.59a1.125 1.125 0 0 1 1.54-.413l.657.38c.524.3.71.96.463 1.51a9.866 9.866 0 0 0-.985 2.783m-2.91 9.09h2.91"
            className="h-5 w-5 text-vc-text-muted"
          />
          Send Reminders
        </Link>

        {isAdmin && (
          <>
            <div className="mx-5 border-t border-vc-border-light" />

            <ExpandableSection
              label="Organization"
              iconPath="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
            >
              <Link href="/dashboard/org/teams" onClick={onClose} className="block px-5 py-2.5 text-sm text-vc-text-secondary active:bg-vc-sand/20">Teams</Link>
              <Link href="/dashboard/org/check-ins" onClick={onClose} className="block px-5 py-2.5 text-sm text-vc-text-secondary active:bg-vc-sand/20">Check-Ins</Link>
              <Link href="/dashboard/org/campuses" onClick={onClose} className="block px-5 py-2.5 text-sm text-vc-text-secondary active:bg-vc-sand/20">Campuses</Link>
              <Link href="/dashboard/org/billing" onClick={onClose} className="block px-5 py-2.5 text-sm text-vc-text-secondary active:bg-vc-sand/20">Billing</Link>
              <Link href="/dashboard/settings" onClick={onClose} className="block px-5 py-2.5 text-sm text-vc-text-secondary active:bg-vc-sand/20">Settings</Link>
            </ExpandableSection>
          </>
        )}

        <Link
          href="/dashboard/help"
          onClick={onClose}
          className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium text-vc-text-secondary active:bg-vc-sand/20"
        >
          <Icon
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
            className="h-5 w-5 text-vc-text-muted"
          />
          Help
        </Link>

        <Link
          href="/dashboard/my-orgs"
          onClick={onClose}
          className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium text-vc-text-secondary active:bg-vc-sand/20"
        >
          <Icon
            d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
            className="h-5 w-5 text-vc-text-muted"
          />
          My Organizations
        </Link>

        <div className="mx-5 border-t border-vc-border-light" />

        <button
          onClick={async () => {
            onClose();
            await onSignOut();
          }}
          className="flex w-full items-center gap-3 px-5 py-3.5 text-sm font-medium text-vc-text-secondary active:bg-vc-sand/20"
        >
          <Icon
            d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
            className="h-5 w-5 text-vc-text-muted"
          />
          Sign Out
        </button>

        {/* Bottom safe area spacer */}
        <div className="h-2" />
      </div>
    </>
  );
}
