"use client";

import { useEffect, useRef } from "react";
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
 * Accessibility:
 *  - Renders an sr-only `<h1>` containing "Module — ActiveTab" so screen
 *    readers and browser landmarks have an unambiguous page identity that
 *    includes both the module and the active sub-page. Per Codex Phase 2
 *    retest Finding 2.
 *  - Tab strip wrapped in `<nav aria-label="…">`.
 *  - Active tab has `aria-current="page"`.
 *
 * Mobile:
 *  - Strip width is constrained to the viewport via `min-w-0` chain so
 *    wide tab lists (e.g. People with 7 tabs) scroll horizontally INSIDE
 *    the nav instead of overflowing the page. Per Codex Phase 2 retest
 *    Finding 1.
 *  - Active tab is auto-scrolled into view on mount and on route change
 *    so far-right tabs (e.g. People → Feedback) land visible.
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
  const navRef = useRef<HTMLElement | null>(null);

  // Derive active tab: prefer explicit prop; otherwise match the most
  // specific tab href that is a prefix of the current pathname.
  const derivedActive = (() => {
    if (activeTabId) return activeTabId;
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

  const activeTab = tabs.find((t) => t.id === derivedActive);
  const defaultTabHref = tabs[0]?.href;

  // Auto-scroll the active tab into view on mount and on route change so
  // far-right tabs (e.g. People → Feedback at slot 7 on mobile) land
  // visible instead of off-screen. Codex Phase 2 retest Finding 1.
  useEffect(() => {
    if (!navRef.current) return;
    const activeEl = navRef.current.querySelector<HTMLElement>('[aria-current="page"]');
    if (!activeEl) return;
    // `block: "nearest"` avoids vertical jumps; `inline: "center"` keeps
    // the active tab visible regardless of scroll position.
    activeEl.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
  }, [derivedActive]);

  // Sticky strip — fully opaque bg so content scrolling underneath is hidden.
  // Negative horizontal margins (-mx-N) escape the parent's horizontal padding
  // so the strip spans the full main-content width. NO negative margin-top:
  // the strip sits at the natural top of main's content area (below padding)
  // and slides smoothly up to viewport top via `sticky top-0` as the user
  // scrolls.
  return (
    <div className="sticky top-0 z-30 -mx-4 mb-6 border-b border-vc-border-light bg-vc-bg px-4 shadow-[0_4px_8px_-6px_rgba(15,23,42,0.06)] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:-mx-10 xl:px-10">
      {/* Visually-hidden h1 = page identity for screen readers. Includes the
          active tab text so navigating between tabs announces the new
          identity (e.g. "People — Feedback"). The visual identity for
          sighted users is the active tab in the strip below. */}
      <h1 className="sr-only">
        {moduleLabel}
        {activeTab ? ` — ${activeTab.label}` : ""}
      </h1>

      {/* min-h locks the strip's height consistent across pages. min-w-0
          on the inner flex container allows children (the nav) to shrink
          below their content width so the nav's `overflow-x-auto` clips
          and scrolls instead of pushing the strip wider than the viewport.
          Without this, wide nav content was making the page itself wider
          than the mobile viewport (Codex Phase 2 retest Finding 1). */}
      <div className="flex min-h-[52px] min-w-0 items-stretch justify-between gap-4">
        <nav
          ref={navRef}
          aria-label={`${moduleLabel} tabs`}
          className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Module identifier breadcrumb — body-sized, NOT an H1. Clickable
              link to the default tab (module home affordance). */}
          {defaultTabHref && (
            <Link
              href={defaultTabHref}
              aria-label={`${moduleLabel} module`}
              className="group flex shrink-0 items-center gap-1.5 pr-3 text-sm font-medium text-vc-text-muted transition-colors hover:text-vc-indigo"
            >
              <svg
                className="h-4 w-4 transition-colors group-hover:text-vc-indigo"
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
            </Link>
          )}

          {/* Tabs */}
          {tabs.map((tab) => {
            const isActive = tab.id === derivedActive;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`group relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t px-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-vc-coral/5 text-vc-indigo"
                    : "text-vc-text-secondary hover:bg-vc-sand/20 hover:text-vc-indigo"
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

        {/* Page-level actions slot — reserved even when empty so the strip
            height stays locked. Desktop only; mobile pages handle their
            primary action below the strip. Compact sizing recommended
            (size="sm" buttons / icon links / 28-36px controls). */}
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          {actions}
        </div>
      </div>
    </div>
  );
}
