"use client";

interface ChildCardProps {
  id: string;
  name: string;
  grade?: string;
  roomName: string;
  hasAlerts: boolean;
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

      {/* Avatar */}
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
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
      <div className="flex gap-1.5">
        {hasAlerts && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
            Allergy
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
