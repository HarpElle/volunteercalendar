"use client";

import Image from "next/image";

interface ChildCardProps {
  id: string;
  name: string;
  grade?: string;
  roomName: string;
  hasAlerts: boolean;
  /**
   * Wave 10 Jason 2026-06-02: discreet flag rendered as a small
   * "Pickup note" badge so the kiosk operator knows pickup
   * restrictions are on file. Deliberately neutral copy.
   */
  hasBlockedPickup?: boolean;
  photoUrl?: string;
  preCheckedIn: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
}

/**
 * Selectable child card for the kiosk check-in flow (Screen 2).
 * Shows name, grade badge, room, allergy indicator.
 */
export function ChildCard({
  id,
  name,
  grade,
  roomName,
  hasAlerts,
  hasBlockedPickup = false,
  photoUrl,
  preCheckedIn,
  selected,
  onToggle,
}: ChildCardProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      className={`
        relative flex flex-col items-center gap-2 p-5 rounded-2xl border-2
        transition-all active:scale-[0.97] min-w-[140px]
        ${selected
          ? "border-vc-coral bg-vc-coral/5 shadow-md"
          : "border-gray-200 bg-white hover:border-gray-300"
        }
      `}
    >
      {/* Selection indicator */}
      <div
        className={`
          absolute top-3 right-3 w-6 h-6 rounded-full border-2 flex items-center justify-center
          transition-colors
          ${selected ? "bg-vc-coral border-vc-coral" : "border-gray-300 bg-white"}
        `}
      >
        {selected && (
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* Avatar (Wave 5 H.6: next/image — kiosk renders many of these
          in a grid, so optimization + lazy-load matters more here than
          almost anywhere else). */}
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt={name}
          width={64}
          height={64}
          className="w-16 h-16 rounded-full object-cover"
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-vc-indigo/10 flex items-center justify-center">
          <span className="text-2xl font-bold text-vc-indigo">
            {name.charAt(0)}
          </span>
        </div>
      )}

      {/* Name */}
      <span className="text-base font-semibold text-vc-indigo text-center leading-tight">
        {name}
      </span>

      {/* Grade badge */}
      {grade && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-vc-indigo/10 text-vc-indigo/70 font-medium">
          {grade}
        </span>
      )}

      {/* Room */}
      <span className="text-sm text-gray-500">{roomName}</span>

      {/* Badges row */}
      <div className="flex gap-1.5 flex-wrap justify-center">
        {hasAlerts && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
            Allergy
          </span>
        )}
        {hasBlockedPickup && (
          <span
            className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium inline-flex items-center gap-1"
            title="Pickup restrictions on file — operator will verify at checkout"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
            Pickup note
          </span>
        )}
        {preCheckedIn && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-vc-sage/20 text-vc-sage font-medium">
            Pre-checked in
          </span>
        )}
      </div>
    </button>
  );
}
