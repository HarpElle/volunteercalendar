"use client";

interface ConflictingReservation {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  requested_by_name: string;
}

interface ReservationConflictModalProps {
  conflicts: ConflictingReservation[];
  onRequestOverride: () => void;
  onChooseDifferentTime: () => void;
  onClose: () => void;
  submitting?: boolean;
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

export function ReservationConflictModal({
  conflicts,
  onRequestOverride,
  onChooseDifferentTime,
  onClose,
  submitting,
}: ReservationConflictModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
            <svg
              className="h-5 w-5 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-vc-indigo font-display">
              Scheduling Conflict
            </h2>
            <p className="text-sm text-gray-500">
              This room is already booked during the requested time.
            </p>
          </div>
        </div>

        {/* Conflicting reservations */}
        <div className="space-y-2 mb-5">
          {conflicts.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
            >
              <p className="text-sm font-medium text-amber-900">{c.title}</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {formatTime12(c.start_time)} &ndash; {formatTime12(c.end_time)}{" "}
                &middot; {c.requested_by_name}
              </p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={onRequestOverride}
            disabled={submitting}
            className="w-full rounded-lg bg-vc-coral px-4 py-2.5 text-sm font-medium text-white hover:bg-vc-coral/90 transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {submitting ? "Submitting..." : "Request Override (Admin Approval)"}
          </button>
          <button
            onClick={onChooseDifferentTime}
            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            Choose a Different Time
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors min-h-[44px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
