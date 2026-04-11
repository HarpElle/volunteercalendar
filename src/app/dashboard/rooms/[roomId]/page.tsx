"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { TabBar } from "@/components/ui/tab-bar";

interface RoomDetail {
  id: string;
  name: string;
  location?: string;
  capacity?: number;
  equipment?: string[];
  is_active: boolean;
  calendar_token?: string;
  display_public?: boolean;
  public_visible?: boolean;
  suggested_ministry_ids?: string[];
}

interface ReservationItem {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  requested_by_name: string;
  is_recurring: boolean;
}

type Tab = "timeline" | "reservations" | "settings";

export default function RoomDetailPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("timeline");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editCapacity, setEditCapacity] = useState("");
  const [copiedIcal, setCopiedIcal] = useState(false);
  const [copiedDisplay, setCopiedDisplay] = useState(false);

  const fetchRoom = useCallback(async () => {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/rooms/${roomId}?church_id=${encodeURIComponent(churchId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setRoom(json.room);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, churchId, roomId]);

  const fetchReservations = useCallback(async () => {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const today = new Date().toISOString().split("T")[0];
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);
      const res = await fetch(
        `/api/reservations?church_id=${encodeURIComponent(churchId)}&room_id=${roomId}&date_from=${today}&date_to=${endDate.toISOString().split("T")[0]}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setReservations(json.reservations || []);
      }
    } catch {
      // silent
    }
  }, [user, churchId, roomId]);

  useEffect(() => {
    fetchRoom();
    fetchReservations();
  }, [fetchRoom, fetchReservations]);

  function startEdit() {
    if (!room) return;
    setEditName(room.name);
    setEditLocation(room.location || "");
    setEditCapacity(room.capacity?.toString() || "");
    setEditing(true);
  }

  async function saveRoom() {
    if (!user || !churchId || !room) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/rooms/${roomId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          name: editName.trim(),
          location: editLocation.trim() || null,
          capacity: editCapacity ? parseInt(editCapacity, 10) : null,
        }),
      });
      if (res.ok) {
        setEditing(false);
        fetchRoom();
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  function copyIcalUrl() {
    if (!room?.calendar_token) return;
    const url = `${window.location.origin.replace(/^http:\/\//, "https://")}/api/calendar/room/${roomId}/${room.calendar_token}`;
    navigator.clipboard.writeText(url);
    setCopiedIcal(true);
    setTimeout(() => setCopiedIcal(false), 2000);
  }

  function copyDisplayUrl() {
    if (!room?.calendar_token || !churchId) return;
    const url = `${window.location.origin}/display/room/${roomId}?token=${room.calendar_token}&church_id=${churchId}`;
    navigator.clipboard.writeText(url);
    setCopiedDisplay(true);
    setTimeout(() => setCopiedDisplay(false), 2000);
  }

  function formatTime12(time24: string): string {
    const [h, m] = time24.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="text-center py-20 text-gray-500">Room not found</div>
    );
  }

  const tabs = [
    { key: "timeline" as Tab, label: "Timeline" },
    { key: "reservations" as Tab, label: "Reservations" },
    { key: "settings" as Tab, label: "Settings" },
  ];

  // Group reservations by date for timeline view
  const byDate = new Map<string, ReservationItem[]>();
  for (const r of reservations) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }
  const sortedDates = [...byDate.keys()].sort();

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vc-indigo font-display">
            {room.name}
          </h1>
          {room.location && (
            <p className="text-sm text-gray-400 mt-0.5">{room.location}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            {room.capacity && (
              <Badge variant="default">Capacity: {room.capacity}</Badge>
            )}
            {!room.is_active && <Badge variant="danger">Inactive</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyDisplayUrl}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            {copiedDisplay ? "Copied!" : "Display URL"}
          </button>
          <button
            onClick={copyIcalUrl}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            {copiedIcal ? "Copied!" : "iCal URL"}
          </button>
        </div>
      </div>

      {/* Equipment */}
      {room.equipment && room.equipment.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {room.equipment.map((eq) => (
            <span
              key={eq}
              className="inline-block rounded-full bg-vc-sand/30 px-2.5 py-0.5 text-xs text-vc-indigo/70"
            >
              {eq}
            </span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <TabBar
        tabs={tabs}
        active={activeTab}
        onChange={(t) => setActiveTab(t)}
      />

      <div className="mt-4">
        {/* Timeline Tab */}
        {activeTab === "timeline" && (
          <div>
            {sortedDates.length === 0 ? (
              <p className="text-gray-400 text-sm py-8 text-center">
                No upcoming reservations
              </p>
            ) : (
              <div className="space-y-4">
                {sortedDates.map((date) => (
                  <div key={date}>
                    <h3 className="text-sm font-semibold text-gray-500 mb-2">
                      {new Date(date + "T12:00:00").toLocaleDateString(
                        undefined,
                        {
                          weekday: "long",
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </h3>
                    <div className="space-y-1">
                      {byDate.get(date)!.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3"
                        >
                          <div
                            className={`w-1 h-8 rounded-full ${
                              r.status === "confirmed"
                                ? "bg-vc-sage"
                                : r.status === "pending_approval"
                                  ? "bg-amber-400"
                                  : "bg-gray-300"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-vc-indigo truncate">
                              {r.title}
                            </p>
                            <p className="text-xs text-gray-400">
                              {r.requested_by_name}
                              {r.is_recurring && " (recurring)"}
                            </p>
                          </div>
                          <span className="text-sm text-gray-500 shrink-0">
                            {formatTime12(r.start_time)} &ndash;{" "}
                            {formatTime12(r.end_time)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reservations Tab */}
        {activeTab === "reservations" && (
          <div>
            {reservations.length === 0 ? (
              <p className="text-gray-400 text-sm py-8 text-center">
                No reservations in the next 30 days
              </p>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                      <th className="px-4 py-3">Title</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-gray-50 last:border-0"
                      >
                        <td className="px-4 py-3 font-medium text-vc-indigo">
                          {r.title}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(
                            r.date + "T12:00:00",
                          ).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {formatTime12(r.start_time)} &ndash;{" "}
                          {formatTime12(r.end_time)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              r.status === "confirmed"
                                ? "success"
                                : r.status === "pending_approval"
                                  ? "warning"
                                  : "default"
                            }
                          >
                            {r.status === "pending_approval"
                              ? "Pending"
                              : r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {r.requested_by_name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="max-w-lg">
            {editing ? (
              <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Room Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Capacity
                  </label>
                  <input
                    type="number"
                    value={editCapacity}
                    onChange={(e) => setEditCapacity(e.target.value)}
                    min={1}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={saveRoom}
                    disabled={saving || !editName.trim()}
                    className="rounded-lg bg-vc-coral px-4 py-2.5 text-sm font-medium text-white hover:bg-vc-coral/90 transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-vc-indigo font-display">
                    Room Details
                  </h3>
                  <button
                    onClick={startEdit}
                    className="text-sm text-vc-coral font-medium hover:underline min-h-[44px]"
                  >
                    Edit
                  </button>
                </div>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-gray-400">Name</dt>
                    <dd className="text-vc-indigo font-medium">{room.name}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Location</dt>
                    <dd className="text-vc-indigo">
                      {room.location || "Not set"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Capacity</dt>
                    <dd className="text-vc-indigo">
                      {room.capacity || "Not set"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Visibility</dt>
                    <dd className="text-vc-indigo">
                      {room.public_visible ? "Public" : "Internal only"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Status</dt>
                    <dd>
                      <Badge
                        variant={room.is_active ? "success" : "danger"}
                      >
                        {room.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
