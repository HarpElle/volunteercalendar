"use client";

interface RoomChildCardProps {
  childName: string;
  grade?: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  hasAlerts: boolean;
  allergies?: string;
  medicalNotes?: string;
  isLate: boolean;
  parentPhoneMasked: string;
  onTap: () => void;
}

/**
 * Child card for the teacher room view.
 * Shows check-in time, alert badges, late indicator.
 * Tap to view allergy details.
 */
export function RoomChildCard({
  childName,
  grade,
  checkedInAt,
  checkedOutAt,
  hasAlerts,
  isLate,
  onTap,
}: RoomChildCardProps) {
  const checkInTime = new Date(checkedInAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <button
      type="button"
      onClick={onTap}
      className={`
        w-full flex items-center gap-4 p-4 rounded-xl border transition-colors text-left
        ${checkedOutAt
          ? "border-gray-200 bg-gray-50 opacity-60"
          : "border-gray-200 bg-white active:bg-vc-coral/5 active:border-vc-coral"
        }
      `}
    >
      {/* Avatar */}
      <div
        className={`
          w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0
          ${checkedOutAt ? "bg-gray-200" : "bg-vc-indigo/10"}
        `}
      >
        <span className={`text-lg font-bold ${checkedOutAt ? "text-gray-400" : "text-vc-indigo"}`}>
          {childName.charAt(0)}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-semibold truncate ${checkedOutAt ? "text-gray-400" : "text-vc-indigo"}`}>
            {childName}
          </span>
          {grade && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex-shrink-0">
              {grade}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-sm text-gray-500">{checkInTime}</span>
          {checkedOutAt && (
            <span className="text-xs text-gray-400">
              Out {new Date(checkedOutAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="flex gap-1.5 flex-shrink-0">
        {isLate && !checkedOutAt && (
          <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
            Late
          </span>
        )}
        {hasAlerts && (
          <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">
            Alert
          </span>
        )}
      </div>
    </button>
  );
}
