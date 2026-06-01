"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/context/auth-context";
import type { ChildGrade } from "@/lib/types";

interface RoomData {
  id: string;
  name: string;
  capacity?: number;
  location?: string;
  default_grades?: ChildGrade[];
  overflow_room_id?: string;
  checkin_view_token?: string;
  is_active: boolean;
  /** Wave 9 P0-5 sub-PR D: ratio enforcement policy. Undefined or
   *  `enabled:false` → no enforcement (matches today's behavior). */
  ratio_policy?: {
    enabled: boolean;
    min_volunteers: number;
    max_children_per_volunteer: number;
    min_unrelated_adults: number;
    max_children?: number;
  };
}

/** Empty ratio policy for new edits. */
const EMPTY_RATIO_POLICY = {
  enabled: false,
  min_volunteers: 2,
  max_children_per_volunteer: 6,
  min_unrelated_adults: 2,
  max_children: "",
} as const;

const ALL_GRADES: { value: ChildGrade; label: string }[] = [
  { value: "nursery", label: "Nursery" },
  { value: "toddler", label: "Toddler" },
  { value: "pre-k", label: "Pre-K" },
  { value: "kindergarten", label: "Kindergarten" },
  { value: "1st", label: "1st" },
  { value: "2nd", label: "2nd" },
  { value: "3rd", label: "3rd" },
  { value: "4th", label: "4th" },
  { value: "5th", label: "5th" },
  { value: "6th", label: "6th" },
];

/**
 * /dashboard/checkin/rooms — Assign grades, capacity, and overflow rooms
 * for children's check-in. Rooms themselves are created via the main room
 * management (Part 2); this page configures check-in-specific fields.
 */
export default function CheckInRoomsPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGrades, setEditGrades] = useState<ChildGrade[]>([]);
  const [editCapacity, setEditCapacity] = useState("");
  const [editOverflow, setEditOverflow] = useState("");
  // Wave 9 P0-5 sub-PR D: ratio policy editor state. max_children
  // stays a string in form state because it's optional — empty string
  // means "no hard cap." All other numeric fields use number.
  const [editRatioEnabled, setEditRatioEnabled] = useState(false);
  const [editMinVolunteers, setEditMinVolunteers] = useState<number>(
    EMPTY_RATIO_POLICY.min_volunteers,
  );
  const [editMaxPerVol, setEditMaxPerVol] = useState<number>(
    EMPTY_RATIO_POLICY.max_children_per_volunteer,
  );
  const [editMinUnrelated, setEditMinUnrelated] = useState<number>(
    EMPTY_RATIO_POLICY.min_unrelated_adults,
  );
  const [editMaxChildren, setEditMaxChildren] = useState<string>("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/rooms?church_id=${churchId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, churchId]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const startEdit = (room: RoomData) => {
    setEditingId(room.id);
    setEditGrades(room.default_grades || []);
    setEditCapacity(room.capacity?.toString() || "");
    setEditOverflow(room.overflow_room_id || "");
    // Wave 9 P0-5 sub-PR D: prime ratio policy from existing doc or
    // sensible defaults (which only take effect when the admin
    // toggles `enabled` on).
    const rp = room.ratio_policy;
    setEditRatioEnabled(rp?.enabled ?? false);
    setEditMinVolunteers(rp?.min_volunteers ?? EMPTY_RATIO_POLICY.min_volunteers);
    setEditMaxPerVol(
      rp?.max_children_per_volunteer ??
        EMPTY_RATIO_POLICY.max_children_per_volunteer,
    );
    setEditMinUnrelated(
      rp?.min_unrelated_adults ?? EMPTY_RATIO_POLICY.min_unrelated_adults,
    );
    setEditMaxChildren(rp?.max_children?.toString() ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditGrades([]);
    setEditCapacity("");
    setEditOverflow("");
    setEditRatioEnabled(false);
    setEditMinVolunteers(EMPTY_RATIO_POLICY.min_volunteers);
    setEditMaxPerVol(EMPTY_RATIO_POLICY.max_children_per_volunteer);
    setEditMinUnrelated(EMPTY_RATIO_POLICY.min_unrelated_adults);
    setEditMaxChildren("");
  };

  const toggleGrade = (grade: ChildGrade) => {
    setEditGrades((prev) =>
      prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade],
    );
  };

  const saveRoom = async (roomId: string) => {
    if (!user || !churchId) return;
    setSaving(roomId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/checkin/rooms", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          church_id: churchId,
          room_id: roomId,
          default_grades: editGrades,
          capacity: editCapacity ? parseInt(editCapacity, 10) : null,
          overflow_room_id: editOverflow || null,
          // Wave 9 P0-5 sub-PR D: ratio policy. Empty max_children
          // input → omit the field so it doesn't apply an inadvertent
          // 0-cap.
          ratio_policy: {
            enabled: editRatioEnabled,
            min_volunteers: editMinVolunteers,
            max_children_per_volunteer: editMaxPerVol,
            min_unrelated_adults: editMinUnrelated,
            ...(editMaxChildren.trim() && !Number.isNaN(parseInt(editMaxChildren, 10))
              ? { max_children: parseInt(editMaxChildren, 10) }
              : {}),
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRooms((prev) =>
          prev.map((r) => (r.id === roomId ? data.room : r)),
        );
        setEditingId(null);
      }
    } catch {
      // silent
    } finally {
      setSaving(null);
    }
  };

  const copyRoomViewUrl = (room: RoomData) => {
    if (!room.checkin_view_token || !churchId) return;
    // Include church_id — the room view route requires it because rooms are
    // scoped under `churches/{cid}/rooms/{rid}`. Without it the page renders
    // "Missing church_id or token parameter."
    const url = `${window.location.origin}/checkin/room/${room.id}?church_id=${encodeURIComponent(churchId)}&token=${encodeURIComponent(room.checkin_view_token)}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(room.id);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  // Rooms that have grades assigned (for overflow picker)
  const checkinRooms = rooms.filter(
    (r) => r.default_grades && r.default_grades.length > 0,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-vc-coral border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vc-indigo font-display">
            Check-In Room Setup
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Assign grades and capacity to rooms for children&apos;s check-in.
          </p>
        </div>
      </div>

      {rooms.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">
            No rooms found. Rooms are created in the Room Management section.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rooms.filter((r) => r.is_active).map((room) => {
            const isEditing = editingId === room.id;
            const hasGrades = room.default_grades && room.default_grades.length > 0;

            return (
              <div
                key={room.id}
                className="bg-white rounded-xl border border-gray-200 p-5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-vc-indigo">
                      {room.name}
                    </h3>
                    {room.location && (
                      <p className="text-sm text-gray-400">{room.location}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {hasGrades && room.checkin_view_token && (
                      <button
                        type="button"
                        onClick={() => copyRoomViewUrl(room)}
                        className="px-3 py-1.5 rounded-lg text-sm text-gray-500 border border-gray-200
                          hover:border-gray-300 transition-colors"
                      >
                        {copiedToken === room.id ? "Copied!" : "Copy Room View URL"}
                      </button>
                    )}
                    {!isEditing ? (
                      <button
                        type="button"
                        onClick={() => startEdit(room)}
                        className="px-4 py-1.5 rounded-lg text-sm font-medium text-vc-coral
                          border border-vc-coral/30 hover:bg-vc-coral/5 transition-colors"
                      >
                        Edit
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-3 py-1.5 rounded-lg text-sm text-gray-500
                            border border-gray-200 hover:border-gray-300 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => saveRoom(room.id)}
                          disabled={saving === room.id}
                          className="px-4 py-1.5 rounded-lg text-sm font-medium text-white
                            bg-vc-coral hover:bg-vc-coral/90 disabled:opacity-50 transition-colors"
                        >
                          {saving === room.id ? "Saving..." : "Save"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Display mode */}
                {!isEditing && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {hasGrades ? (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          {room.default_grades!.map((g) => (
                            <span
                              key={g}
                              className="px-2.5 py-1 rounded-full bg-vc-sage/15 text-vc-sage
                                text-xs font-medium"
                            >
                              {ALL_GRADES.find((ag) => ag.value === g)?.label || g}
                            </span>
                          ))}
                        </div>
                        {room.capacity && (
                          <span className="text-sm text-gray-400">
                            Capacity: {room.capacity}
                          </span>
                        )}
                        {room.overflow_room_id && (
                          <span className="text-sm text-gray-400">
                            Overflow:{" "}
                            {rooms.find((r) => r.id === room.overflow_room_id)
                              ?.name || "Unknown"}
                          </span>
                        )}
                        {/* Wave 9 P0-5 sub-PR D: ratio policy summary */}
                        {room.ratio_policy?.enabled && (
                          <span className="px-2 py-1 rounded-full bg-vc-coral/10 text-vc-coral text-xs font-medium">
                            Ratio: 1:{room.ratio_policy.max_children_per_volunteer}
                            {" · "}
                            {room.ratio_policy.min_volunteers}+ volunteers
                            {room.ratio_policy.min_unrelated_adults > 0
                              ? ` · ${room.ratio_policy.min_unrelated_adults} unrelated`
                              : ""}
                            {room.ratio_policy.max_children
                              ? ` · cap ${room.ratio_policy.max_children}`
                              : ""}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-gray-400 italic">
                        No grades assigned — not used for check-in
                      </span>
                    )}
                  </div>
                )}

                {/* Edit mode */}
                {isEditing && (
                  <div className="mt-4 space-y-4">
                    {/* Grade toggles */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-2">
                        Assigned Grades
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {ALL_GRADES.map((g) => {
                          const selected = editGrades.includes(g.value);
                          return (
                            <button
                              key={g.value}
                              type="button"
                              onClick={() => toggleGrade(g.value)}
                              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                selected
                                  ? "bg-vc-sage text-white"
                                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                              }`}
                            >
                              {g.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Capacity */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Capacity
                        </label>
                        <input
                          type="number"
                          value={editCapacity}
                          onChange={(e) => setEditCapacity(e.target.value)}
                          placeholder="e.g., 20"
                          min={1}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200
                            focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                        />
                      </div>

                      {/* Overflow room */}
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Overflow Room
                        </label>
                        <select
                          value={editOverflow}
                          onChange={(e) => setEditOverflow(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200
                            focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none
                            bg-white"
                        >
                          <option value="">None</option>
                          {checkinRooms
                            .filter((r) => r.id !== room.id)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    {/* Wave 9 P0-5 sub-PR D: ratio policy editor */}
                    <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-4">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="block text-sm font-medium text-vc-indigo">
                          Ratio policy
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editRatioEnabled}
                            onChange={(e) => setEditRatioEnabled(e.target.checked)}
                            className="h-4 w-4"
                          />
                          Enabled
                        </label>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        When enabled, the kiosk blocks check-ins that would
                        exceed the policy and warns at 90% of capacity. The
                        warning threshold is global (set in Check-In Settings).
                        Staffed-station operators can override at the kiosk;
                        self-service stations cannot.
                      </p>
                      <div
                        className={`grid grid-cols-2 gap-3 ${editRatioEnabled ? "" : "opacity-60 pointer-events-none"}`}
                      >
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            Min volunteers
                          </label>
                          <input
                            type="number"
                            value={editMinVolunteers}
                            onChange={(e) =>
                              setEditMinVolunteers(
                                Math.max(0, parseInt(e.target.value, 10) || 0),
                              )
                            }
                            min={0}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200
                              focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            Max children per volunteer
                          </label>
                          <input
                            type="number"
                            value={editMaxPerVol}
                            onChange={(e) =>
                              setEditMaxPerVol(
                                Math.max(1, parseInt(e.target.value, 10) || 1),
                              )
                            }
                            min={1}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200
                              focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            Min unrelated adults (two-deep)
                          </label>
                          <input
                            type="number"
                            value={editMinUnrelated}
                            onChange={(e) =>
                              setEditMinUnrelated(
                                Math.max(0, parseInt(e.target.value, 10) || 0),
                              )
                            }
                            min={0}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200
                              focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                          />
                          <p className="text-[10px] text-gray-400 mt-1">
                            Set to 2 to enforce two-deep leadership. A volunteer related to
                            another volunteer in the same room (household overlap) doesn&apos;t
                            count.
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            Max children cap (optional)
                          </label>
                          <input
                            type="number"
                            value={editMaxChildren}
                            onChange={(e) => setEditMaxChildren(e.target.value)}
                            placeholder="No cap"
                            min={1}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200
                              focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                          />
                          <p className="text-[10px] text-gray-400 mt-1">
                            Hard cap regardless of volunteer count. Leave blank to
                            use ratio alone.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
