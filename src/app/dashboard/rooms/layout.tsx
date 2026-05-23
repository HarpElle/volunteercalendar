"use client";

import { TierGateBoundary } from "@/components/dashboard/tier-gate-boundary";

/**
 * Rooms module layout.
 *
 * Wrapped in <TierGateBoundary module="rooms"> so Free-tier visitors who
 * hit /dashboard/rooms or any of its sub-routes (calendar, requests,
 * facility, settings, [roomId]) directly see an upgrade-prompt screen
 * instead of the actual Rooms functionality. Sidebar / More-menu lock
 * badges continue to work the same way; this is the URL-level
 * enforcement that Codex Pass A retest flagged as missing.
 *
 * Unlike /dashboard/worship/layout.tsx and /dashboard/checkin/layout.tsx,
 * this layout does NOT mount a ModuleTabs strip. Rooms sub-pages each
 * render <RoomsShell /> internally, so a layout-level strip would
 * duplicate. The gate is the only thing this layout adds.
 */
export default function RoomsLayout({ children }: { children: React.ReactNode }) {
  return <TierGateBoundary module="rooms">{children}</TierGateBoundary>;
}
