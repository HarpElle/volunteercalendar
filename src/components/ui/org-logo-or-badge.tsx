/**
 * Wave 11 Org Branding Sub-PR D — reusable "church logo if uploaded,
 * else the CheckInBadge" mark.
 *
 * Used across parent-facing surfaces (kiosk welcome screen, /guardian
 * portal, kiosk room display) so the visual identity is consistent:
 * if the church has uploaded a logo via Settings → Branding (Sub-PR A),
 * it shows up here. Otherwise the VolunteerCal CheckInBadge stays.
 *
 * Why this is a component instead of inline ternaries everywhere:
 *   - The size + shape + accessibility plumbing is the same across
 *     surfaces; centralizing avoids drift.
 *   - Future tweaks (e.g. dark variant, animated reveal) land in one
 *     place.
 *   - When/if a logo fails to load (404 from Storage, network blip),
 *     the <img onError> falls back to the badge — never breaks the
 *     surrounding layout.
 */

"use client";

import { useState } from "react";
import { CheckInBadge } from "./check-in-badge";

interface OrgLogoOrBadgeProps {
  /** Public URL of the church's uploaded logo, or null/undefined to use the badge. */
  logoUrl?: string | null;
  /** Outer width/height in pixels. The logo image fits inside this box. */
  size?: number;
  /** Pass-through className for spacing/positioning. */
  className?: string;
  /**
   * Accessible label. Default: "Church logo" when a logo is present,
   * otherwise the CheckInBadge's default ("VolunteerCal Check-In").
   */
  ariaLabel?: string;
  /**
   * Decorative-only mode. Skips ARIA when adjacent text already names
   * the org (e.g. when this sits beside the church name).
   */
  decorative?: boolean;
}

export function OrgLogoOrBadge({
  logoUrl,
  size = 48,
  className,
  ariaLabel,
  decorative = false,
}: OrgLogoOrBadgeProps) {
  // Track <img> load failures so we fall back to the badge if Storage
  // returns 404 or the URL is malformed. Keeps the layout stable.
  const [imgFailed, setImgFailed] = useState(false);

  if (!logoUrl || imgFailed) {
    return (
      <CheckInBadge
        size={size}
        className={className}
        ariaLabel={ariaLabel ?? "VolunteerCal Check-In"}
        decorative={decorative}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={decorative ? "" : (ariaLabel ?? "Church logo")}
      width={size}
      height={size}
      className={`${className ?? ""} object-contain`}
      onError={() => setImgFailed(true)}
      aria-hidden={decorative ? true : undefined}
    />
  );
}
