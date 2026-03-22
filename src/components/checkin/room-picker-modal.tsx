"use client";

import { useEffect, useState } from "react";

interface RoomOption {
  id: string;
  name: string;
  capacity?: number;
  currentCount?: number;
}

interface RoomPickerModalProps {
  childName: string;
  rooms: RoomOption[];
  currentRoomId?: string;
  onSelect: (roomId: string) => void;
  onClose: () => void;
}

/**
 * Room override picker for kiosk check-in (Screen 2).
 * Shows available rooms with capacity indicators.
 */
export function RoomPickerModal({
  childName,
  rooms,
  currentRoomId,
  onSelect,
  onClose,
}: RoomPickerModalProps) {
  const [selectedId, setSelectedId] = useState(currentRoomId || "");

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-vc-indigo font-display">
            Choose Room for {childName}
          </h3>
        </div>

        <div className="p-4 max-h-[50vh] overflow-y-auto space-y-2">
          {rooms.map((room) => {
            const atCapacity =
              room.capacity && room.currentCount !== undefined
                ? room.currentCount >= room.capacity
                : false;
            const nearCapacity =
              room.capacity && room.currentCount !== undefined
                ? room.currentCount >= room.capacity * 0.8
                : false;

            return (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedId(room.id)}
                className={`
                  w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all
                  ${selectedId === room.id
                    ? "border-vc-coral bg-vc-coral/5"
                    : "border-gray-200 hover:border-gray-300"
                  }
                `}
              >
                <span className="font-semibold text-vc-indigo">
                  {room.name}
                </span>
                {room.capacity && (
                  <span
                    className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                      atCapacity
                        ? "bg-red-100 text-red-700"
                        : nearCapacity
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {room.currentCount ?? 0}/{room.capacity}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-full border-2 border-gray-200 text-gray-600 font-semibold
              active:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedId) onSelect(selectedId);
            }}
            disabled={!selectedId}
            className="flex-1 h-12 rounded-full bg-vc-coral text-white font-semibold
              active:bg-vc-coral/90 transition-colors disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
