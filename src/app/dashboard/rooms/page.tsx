"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface RoomItem {
  id: string;
  name: string;
  location?: string;
  capacity?: number;
  equipment?: string[];
  is_active: boolean;
  display_public?: boolean;
}

export default function RoomsPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newCapacity, setNewCapacity] = useState("");

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
      setLoading(false);
    }
  }, [user, churchId]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  async function handleCreate() {
    if (!user || !churchId || !newName.trim()) return;
    setCreating(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          name: newName.trim(),
          location: newLocation.trim() || undefined,
          capacity: newCapacity ? parseInt(newCapacity, 10) : undefined,
        }),
      });
      if (res.ok) {
        setNewName("");
        setNewLocation("");
        setNewCapacity("");
        setShowCreateModal(false);
        fetchRooms();
      }
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vc-indigo font-display">
            Rooms
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage rooms and spaces for booking
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-vc-coral px-4 py-2.5 text-sm font-medium text-white hover:bg-vc-coral/90 transition-colors min-h-[44px]"
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
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Add Room
        </button>
      </div>

      {/* Room grid */}
      {rooms.length === 0 ? (
        <EmptyState
          title="No rooms yet"
          description="Add your first room to start managing space reservations."
          action={
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-vc-coral px-4 py-2.5 text-sm font-medium text-white hover:bg-vc-coral/90 transition-colors"
            >
              Add Room
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <Link
              key={room.id}
              href={`/dashboard/rooms/${room.id}`}
              className="group rounded-xl border border-gray-200 bg-white p-5 hover:border-vc-coral/30 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-vc-indigo font-display group-hover:text-vc-coral transition-colors">
                    {room.name}
                  </h3>
                  {room.location && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {room.location}
                    </p>
                  )}
                </div>
                {!room.is_active && (
                  <Badge variant="danger">Inactive</Badge>
                )}
              </div>

              {/* Capacity */}
              {room.capacity && (
                <p className="text-sm text-gray-500 mb-2">
                  Capacity: {room.capacity}
                </p>
              )}

              {/* Equipment badges */}
              {room.equipment && room.equipment.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {room.equipment.slice(0, 4).map((eq) => (
                    <span
                      key={eq}
                      className="inline-block rounded-full bg-vc-sand/30 px-2.5 py-0.5 text-xs text-vc-indigo/70"
                    >
                      {eq}
                    </span>
                  ))}
                  {room.equipment.length > 4 && (
                    <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
                      +{room.equipment.length - 4}
                    </span>
                  )}
                </div>
              )}

              {/* Quick action hint */}
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {room.display_public ? "Public" : "Internal"}
                </span>
                <span className="text-xs text-vc-coral opacity-0 group-hover:opacity-100 transition-opacity">
                  View details
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl mx-4">
            <h2 className="text-lg font-bold text-vc-indigo font-display mb-4">
              Add Room
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Room Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Fellowship Hall"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="e.g. Building A, 2nd Floor"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Capacity
                </label>
                <input
                  type="number"
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(e.target.value)}
                  placeholder="Optional"
                  min={1}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="rounded-lg bg-vc-coral px-4 py-2.5 text-sm font-medium text-white hover:bg-vc-coral/90 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {creating ? "Creating..." : "Create Room"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
