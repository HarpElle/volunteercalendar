"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { RecurrenceRulePicker } from "./recurrence-rule-picker";
import { ReservationConflictModal } from "./reservation-conflict-modal";
import type { RecurrenceRule } from "@/lib/types";

interface RoomOption {
  id: string;
  name: string;
  capacity?: number;
  equipment?: string[];
  location?: string;
}

interface RoomBookingFormProps {
  churchId: string;
  onClose: () => void;
  onCreated: () => void;
  /** Pre-select a room */
  initialRoomId?: string;
  /** Whether recurring is allowed by tier */
  recurringEnabled?: boolean;
}

type Step = 1 | 2 | 3 | 4 | 5;

interface ConflictData {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  requested_by_name: string;
}

export function RoomBookingForm({
  churchId,
  onClose,
  onCreated,
  initialRoomId,
  recurringEnabled = false,
}: RoomBookingFormProps) {
  const { user } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  // Step 1: Room
  const [selectedRoomId, setSelectedRoomId] = useState(initialRoomId || "");

  // Step 2: Date & Time
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");

  // Step 3: Details
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attendeeCount, setAttendeeCount] = useState("");
  const [setupNotes, setSetupNotes] = useState("");
  const [equipmentRequested, setEquipmentRequested] = useState<string[]>([]);

  // Step 4: Recurrence
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(
    null,
  );

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictData[] | null>(null);
  const [error, setError] = useState("");

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);

  const fetchRooms = useCallback(async () => {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/rooms?church_id=${encodeURIComponent(churchId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setRooms(json.rooms || []);
      }
    } catch {
      // silent
    } finally {
      setLoadingRooms(false);
    }
  }, [user, churchId]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // If room pre-selected, skip to step 2
  useEffect(() => {
    if (initialRoomId && rooms.length > 0) {
      setStep(2);
    }
  }, [initialRoomId, rooms]);

  async function handleSubmit(allowConflict = false) {
    if (!user || !churchId) return;
    setSubmitting(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const body: Record<string, unknown> = {
        church_id: churchId,
        room_id: selectedRoomId,
        title: title.trim(),
        description: description.trim() || undefined,
        date,
        start_time: startTime,
        end_time: endTime,
        attendee_count: attendeeCount ? parseInt(attendeeCount, 10) : undefined,
        setup_notes: setupNotes.trim() || undefined,
        equipment_requested: equipmentRequested,
        allow_conflict: allowConflict,
      };
      if (recurrenceRule) {
        body.recurrence_rule = recurrenceRule;
      }

      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.conflicts) {
          setConflicts(json.conflicts);
        } else {
          setError(json.error || "Failed to create reservation");
        }
        return;
      }

      onCreated();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleEquipment(item: string) {
    setEquipmentRequested((prev) =>
      prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item],
    );
  }

  const canProceed = (s: Step): boolean => {
    switch (s) {
      case 1:
        return !!selectedRoomId;
      case 2:
        return !!date && !!startTime && !!endTime && startTime < endTime;
      case 3:
        return !!title.trim();
      case 4:
        return true;
      case 5:
        return true;
      default:
        return false;
    }
  };

  const stepLabels = ["Room", "Date & Time", "Details", "Recurrence", "Review"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-vc-indigo font-display">
            Book a Room
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-gray-50">
          {stepLabels.map((label, idx) => {
            const s = (idx + 1) as Step;
            // Skip recurrence step if not enabled
            if (s === 4 && !recurringEnabled) return null;
            const isActive = step === s;
            const isDone = step > s;
            return (
              <div key={s} className="flex items-center gap-1">
                {idx > 0 && (
                  <div
                    className={`w-4 h-px ${isDone ? "bg-vc-coral" : "bg-gray-200"}`}
                  />
                )}
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    isActive
                      ? "bg-vc-coral text-white"
                      : isDone
                        ? "text-vc-coral"
                        : "text-gray-400"
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Step 1: Select Room */}
          {step === 1 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500 mb-3">
                Select a room to book
              </p>
              {loadingRooms ? (
                <p className="text-gray-400 text-sm">Loading rooms...</p>
              ) : (
                rooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setSelectedRoomId(room.id)}
                    className={`w-full text-left rounded-lg border p-4 transition-colors ${
                      selectedRoomId === room.id
                        ? "border-vc-coral bg-vc-coral/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <p className="font-medium text-vc-indigo">{room.name}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                      {room.location && <span>{room.location}</span>}
                      {room.capacity && <span>Capacity: {room.capacity}</span>}
                    </div>
                    {room.equipment && room.equipment.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {room.equipment.map((eq) => (
                          <span
                            key={eq}
                            className="text-xs bg-vc-sand/30 px-2 py-0.5 rounded-full text-vc-indigo/60"
                          >
                            {eq}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Step 2: Date & Time */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                  />
                </div>
              </div>
              {startTime >= endTime && date && (
                <p className="text-xs text-red-500">
                  End time must be after start time
                </p>
              )}
            </div>
          )}

          {/* Step 3: Details */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Youth Group Meeting"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expected Attendees (optional)
                </label>
                <input
                  type="number"
                  value={attendeeCount}
                  onChange={(e) => setAttendeeCount(e.target.value)}
                  min={1}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                />
              </div>
              {selectedRoom?.equipment && selectedRoom.equipment.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Equipment Needed
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedRoom.equipment.map((eq) => (
                      <button
                        key={eq}
                        type="button"
                        onClick={() => toggleEquipment(eq)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          equipmentRequested.includes(eq)
                            ? "bg-vc-coral text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {eq}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Setup Notes (optional)
                </label>
                <textarea
                  value={setupNotes}
                  onChange={(e) => setSetupNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Need chairs in a circle, whiteboard at front"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none resize-none"
                />
              </div>
            </div>
          )}

          {/* Step 4: Recurrence */}
          {step === 4 && recurringEnabled && (
            <RecurrenceRulePicker
              value={recurrenceRule}
              onChange={setRecurrenceRule}
              startDate={date}
            />
          )}

          {/* Step 5: Review */}
          {step === 5 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-vc-indigo font-display">
                Review Your Booking
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-400">Room</dt>
                  <dd className="text-vc-indigo font-medium">
                    {selectedRoom?.name}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">Date</dt>
                  <dd className="text-vc-indigo">
                    {new Date(date + "T12:00:00").toLocaleDateString(
                      undefined,
                      {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      },
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">Time</dt>
                  <dd className="text-vc-indigo">
                    {startTime} &ndash; {endTime}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">Title</dt>
                  <dd className="text-vc-indigo font-medium">{title}</dd>
                </div>
                {description && (
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Description</dt>
                    <dd className="text-vc-indigo text-right max-w-[200px] truncate">
                      {description}
                    </dd>
                  </div>
                )}
                {equipmentRequested.length > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Equipment</dt>
                    <dd className="text-vc-indigo">
                      {equipmentRequested.join(", ")}
                    </dd>
                  </div>
                )}
                {recurrenceRule && (
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Repeats</dt>
                    <dd className="text-vc-coral font-medium">Yes</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button
            onClick={step === 1 ? onClose : () => {
              // Skip recurrence step if not enabled
              const prev = step === 5 && !recurringEnabled ? 3 : step - 1;
              setStep(prev as Step);
            }}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 5 ? (
            <button
              onClick={() => {
                // Skip recurrence step if not enabled
                const next = step === 3 && !recurringEnabled ? 5 : step + 1;
                setStep(next as Step);
              }}
              disabled={!canProceed(step)}
              className="rounded-lg bg-vc-coral px-6 py-2.5 text-sm font-medium text-white hover:bg-vc-coral/90 transition-colors disabled:opacity-50 min-h-[44px]"
            >
              Next
            </button>
          ) : (
            <button
              onClick={() => handleSubmit(false)}
              disabled={submitting}
              className="rounded-lg bg-vc-coral px-6 py-2.5 text-sm font-medium text-white hover:bg-vc-coral/90 transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {submitting ? "Booking..." : "Book Room"}
            </button>
          )}
        </div>
      </div>

      {/* Conflict modal */}
      {conflicts && (
        <ReservationConflictModal
          conflicts={conflicts}
          onRequestOverride={() => {
            setConflicts(null);
            handleSubmit(true);
          }}
          onChooseDifferentTime={() => {
            setConflicts(null);
            setStep(2);
          }}
          onClose={() => setConflicts(null)}
          submitting={submitting}
        />
      )}
    </div>
  );
}
