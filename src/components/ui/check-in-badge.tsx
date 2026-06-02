/**
 * Wave 11 Check-In Badge Rollout — extracted from the
 * src/lib/server/wallet-pass/assets.ts inline SVG (used on the
 * Apple Wallet family pass) into a reusable React component for
 * use on kiosk + parent-facing surfaces.
 *
 * Same brand language as the main VolunteerCal app icon (rounded
 * indigo square + cream stroke), but the body shows a CALENDAR +
 * CHECKMARK instead of three calendar dots — communicating
 * "this is the Check-In feature" specifically.
 *
 * Admin / in-platform surfaces should keep using the main
 * VolunteerCal calendar-three-dots icon (since admins know the
 * brand and Check-In is one of many features). This badge is
 * specifically for user-facing CHECK-IN surfaces seen in
 * isolation (kiosk welcome screen, room rosters, parent self-
 * service, the wallet pass itself).
 */

import { type ReactElement } from "react";

interface CheckInBadgeProps {
  /** Outer width/height in pixels. Defaults to 48. */
  size?: number;
  /** Pass-through className for spacing/positioning. */
  className?: string;
  /** Accessible label. Default: "VolunteerCal Check-In". */
  ariaLabel?: string;
  /**
   * Decorative-only mode. When true, the SVG is aria-hidden and
   * the wrapping element gets no role. Use when the badge is
   * adjacent to text that already names the feature.
   */
  decorative?: boolean;
}

export function CheckInBadge({
  size = 48,
  className,
  ariaLabel = "VolunteerCal Check-In",
  decorative = false,
}: CheckInBadgeProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : ariaLabel}
    >
      <rect width="512" height="512" rx="96" fill="#2D3047" />
      <g
        transform="translate(96 96) scale(13.333)"
        fill="none"
        stroke="#FEFCF9"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x={3} y={4} width={18} height={18} rx={2} />
        <line x1={3} y1={10} x2={21} y2={10} />
        <line x1={9} y1={4} x2={9} y2={10} />
        <line x1={15} y1={4} x2={15} y2={10} />
        <polyline
          points="8,16.5 10.5,19 16,13.5"
          strokeWidth={2.5}
        />
      </g>
    </svg>
  );
}
