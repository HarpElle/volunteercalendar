"use client";

import { useState } from "react";
import Image from "next/image";
import type { OrgEligibility } from "@/lib/utils/eligibility";

const SIZE_MAP = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-xl",
} as const;

// Wave 5 H.6: next/image wants explicit width/height. These mirror
// the Tailwind h-* / w-* classes above (8 = 32px, 10 = 40px, 14 = 56px,
// 20 = 80px) so the rendered + intrinsic sizes match. Same dimensions
// drive the srcset hint for proper retina-density delivery.
const SIZE_PX_MAP = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
} as const;

const ELIGIBILITY_DOTS: Record<string, { color: string; ring: string; label: string } | null> = {
  cleared: { color: "bg-vc-sage", ring: "ring-vc-sage/30", label: "Cleared to serve" },
  in_progress: { color: "bg-vc-sand", ring: "ring-vc-sand/30", label: "Onboarding in progress" },
  not_started: { color: "bg-vc-text-muted/60", ring: "ring-vc-text-muted/20", label: "Onboarding not started" },
  no_prereqs: null,
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

interface AvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  eligibility?: OrgEligibility;
  showUploadOverlay?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Avatar({
  name,
  photoUrl,
  size = "md",
  eligibility,
  showUploadOverlay,
  onClick,
  className = "",
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showPhoto = photoUrl && !imgError;
  const eligConfig = eligibility ? ELIGIBILITY_DOTS[eligibility] : null;
  const interactive = !!onClick;

  return (
    <div
      className={`relative shrink-0 ${interactive ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
    >
      {showPhoto ? (
        <Image
          src={photoUrl!}
          alt={name}
          width={SIZE_PX_MAP[size]}
          height={SIZE_PX_MAP[size]}
          onError={() => setImgError(true)}
          // unoptimized only for non-Firebase non-Google hosts (e.g.
          // if a user pasted in an external URL). For Firebase Storage
          // + Google Photos / Gravatar, next/image's optimizer + CDN
          // are doing real work — keep that on.
          className={`rounded-full object-cover ${SIZE_MAP[size]}`}
        />
      ) : (
        <div
          className={`flex items-center justify-center rounded-full bg-vc-indigo/8 font-semibold text-vc-indigo ${SIZE_MAP[size]}`}
        >
          {getInitials(name)}
        </div>
      )}

      {/* Eligibility dot */}
      {eligConfig && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ${eligConfig.color} ring-2 ${eligConfig.ring} ring-offset-1 ring-offset-white`}
          title={eligConfig.label}
        />
      )}

      {/* Upload overlay on hover */}
      {showUploadOverlay && interactive && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-vc-indigo/50 opacity-0 transition-opacity hover:opacity-100">
          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
          </svg>
        </div>
      )}
    </div>
  );
}
