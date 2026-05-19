"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ModuleTab {
  id: string;
  label: string;
  href: string;
  /** Optional badge (e.g. count, dot) rendered after the label */
  badge?: React.ReactNode;
}

export interface ModuleTabsProps {
  /** Module identifier used to render the small icon+name breadcrumb */
  moduleLabel: string;
  moduleIconPath: string;
  tabs: ModuleTab[];
  /** Override which tab is considered active. Default: derive from pathname. */
  activeTabId?: string;
  /** Optional right-aligned actions (Create, Filter, Export) on desktop */
  actions?: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component — Vercel/Stripe/WorshipTools sticky tab strip            */
/* ------------------------------------------------------------------ */

/**
 * Sticky tab strip at the top of a module's content area. The active tab IS
 * the page identity — there is no large module-name H1 above the strip.
 * Module icon + name appear at body size to the LEFT as a breadcrumb.
 *
 * Accessibility: each module page must ALSO render a visually-hidden `h1`
 * (sr-only) so screen readers and browser landmarks have an unambiguous
 * page identity. The tab strip is wrapped in `<nav aria-label="...">`.
 *
 * Pattern spec: IMPLEMENTATION_PLAN.md §4.
 */
export function ModuleTabs({
  moduleLabel,
  moduleIconPath,
  tabs,
  activeTabId,
  actions,
}: ModuleTabsProps) {
  const pathname = usePathname();

  // Derive active tab: prefer explicit prop; otherwise match the most
  // specific tab href that is a prefix of the current pathname.
  const derivedActive = (() => {
    if (activeTabId) return activeTabId;
    // Longest matching href wins (so /dashboard/people/teams beats /dashboard/people)
    let bestId: string | null = null;
    let bestLength = -1;
    for (const tab of tabs) {
      if (
        (pathname === tab.href || pathname.startsWith(tab.href + "/")) &&
        tab.href.length > bestLength
      ) {
        bestLength = tab.href.length;
        bestId = tab.id;
      }
    }
    return bestId ?? tabs[0]?.id;
  })();

  return (
    <div className="sticky top-0 z-30 -mx-4 -mt-4 mb-6 border-b border-vc-border-light bg-vc-bg/95 px-4 backdrop-blur-sm sm:-mx-6 sm:-mt-6 sm:px-6 lg:-mx-8 lg:-mt-8 lg:px-8 xl:-mx-10 xl:px-10">
      <div className="flex items-end justify-between gap-4">
        <nav
          aria-label={`${moduleLabel} tabs`}
          className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto"
        >
          {/* Module identifier breadcrumb — body-sized, NOT an H1 */}
          <div className="flex shrink-0 items-center gap-1.5 pb-3 pr-3 text-sm font-medium text-vc-text-muted">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={moduleIconPath}
              />
            </svg>
            <span>{moduleLabel}</span>
            <span className="text-vc-text-muted/50">·</span>
          </div>

          {/* Tabs */}
          {tabs.map((tab) => {
            const isActive = tab.id === derivedActive;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`group relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-vc-indigo"
                    : "text-vc-text-secondary hover:text-vc-indigo"
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="text-xs text-vc-text-muted">{tab.badge}</span>
                )}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-vc-coral"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Page-level actions (Create, Filter, Export) — desktop only */}
        {actions && (
          <div className="hidden shrink-0 items-center gap-2 pb-2 lg:flex">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
