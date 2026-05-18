"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { RoomBookingForm } from "@/components/rooms/room-booking-form";
import { TIER_LIMITS } from "@/lib/constants";
import type { SubscriptionTier } from "@/lib/types";
import Link from "next/link";

interface RoomItem {
  id: string;
  name: string;
  location?: string;
  capacity?: number;
  equipment?: string[];
  is_active: boolean;
  display_public?: boolean;
  requires_approval?: boolean;
}

export default function RoomsPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newCapacity, setNewCapacity] = useState("");
  const [newEquipment, setNewEquipment] = useState<string[]>([]);
  const [newRequiresApproval, setNewRequiresApproval] = useState(false);
  const [newPublicVisible, setNewPublicVisible] = useState(true);
  const [equipmentTags, setEquipmentTags] = useState<string[]>([]);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [tier, setTier] = useState<SubscriptionTier>("free");

  const fetchRooms = useCallback(async () => {
    if (!user || !churchId) return;
    setLoadError(null);
    try {
      const token = await user.getIdToken();
      // Admin view: include inactive rooms so admins see everything they manage.
      const res = await fetch(
        `/api/rooms?church_id=${encodeURIComponent(churchId)}&include_inactive=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setRooms(json.rooms || []);
      } else {
        const data = await res.json().catch(() => ({}));
        setLoadError(data.error || `Failed to load rooms (${res.status})`);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load rooms");
    } finally {
      setLoading(false);
    }
  }, [user, churchId]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // Fetch tier (for recurring-reservation gating) and equipment tags (for
  // the Add Room modal). Tier comes from the church doc directly because
  // /api/church-info is a public endpoint that intentionally does not expose
  // subscription_tier — mirroring the pattern used in /calendar/page.tsx.
  useEffect(() => {
    if (!user || !churchId) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const [tierSnap, settingsRes] = await Promise.all([
          getDoc(doc(db, "churches", churchId)),
          fetch(`/api/rooms/settings?church_id=${churchId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (tierSnap.exists()) {
          const t = tierSnap.data().subscription_tier as SubscriptionTier | undefined;
          if (t) setTier(t);
        }
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          const tags = s.settings?.equipment_tags || s.equipment_tags || [];
          setEquipmentTags(tags);
        }
      } catch {
        // Non-critical; fields stay empty
      }
    })();
  }, [user, churchId]);

  function toggleNewEquipment(item: string) {
    setNewEquipment((prev) =>
      prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item],
    );
  }

  function resetCreateForm() {
    setNewName("");
    setNewLocation("");
    setNewCapacity("");
    setNewEquipment([]);
    setNewRequiresApproval(false);
    setNewPublicVisible(true);
    setCreateError(null);
  }

  async function handleCreate() {
    if (!user || !churchId || !newName.trim()) return;
    setCreating(true);
    setCreateError(null);
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
          equipment: newEquipment,
          requires_approval: newRequiresApproval,
          public_visible: newPublicVisible,
        }),
      });
      if (res.ok) {
        resetCreateForm();
        setShowCreateModal(false);
        fetchRooms();
      } else {
        const data = await res.json().catch(() => ({}));
        setCreateError(data.error || `Failed to create room (${res.status})`);
      }
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create room");
    } finally {
      setCreating(false);
    }
  }

  const recurringEnabled = TIER_LIMITS[tier]?.rooms_recurring ?? false;

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-vc-indigo font-display">
            Rooms
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage rooms and spaces for booking
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {rooms.length > 0 && (
            <button
              onClick={() => setShowBookingForm(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-vc-coral text-vc-coral px-4 py-2.5 text-sm font-medium hover:bg-vc-coral/5 transition-colors min-h-[44px]"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              New Reservation
            </button>
          )}
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
      </div>

      {/* Booking form modal */}
      {showBookingForm && churchId && (
        <RoomBookingForm
          churchId={churchId}
          recurringEnabled={recurringEnabled}
          onClose={() => setShowBookingForm(false)}
          onCreated={() => {
            setShowBookingForm(false);
            fetchRooms();
          }}
        />
      )}

      {/* Load error */}
      {loadError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError}
        </div>
      )}

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
                <div className="flex items-center gap-1.5 shrink-0">
                  {room.requires_approval && (
                    <Badge variant="warning">Approval</Badge>
                  )}
                  {!room.is_active && (
                    <Badge variant="danger">Inactive</Badge>
                  )}
                </div>
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

              {/* Equipment — checkboxes from global tags, free-text fallback */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Equipment
                </label>
                {equipmentTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {equipmentTags.map((tag) => {
                      const on = newEquipment.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleNewEquipment(tag)}
                          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                            on
                              ? "border-vc-coral bg-vc-coral/10 text-vc-coral"
                              : "border-gray-200 text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">
                    Add equipment tags in{" "}
                    <Link
                      href="/dashboard/org/campuses"
                      className="text-vc-coral underline"
                    >
                      Room Settings
                    </Link>{" "}
                    first.
                  </p>
                )}
              </div>

              {/* Per-room approval override */}
              <div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newRequiresApproval}
                    onChange={(e) => setNewRequiresApproval(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-vc-coral focus:ring-vc-coral"
                  />
                  <span className="text-sm text-gray-700">
                    Reservations require admin approval
                    <span className="block text-xs text-gray-400 mt-0.5">
                      Overrides the org-wide setting for this room only.
                    </span>
                  </span>
                </label>
              </div>

              {/* Public calendar visibility */}
              <div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPublicVisible}
                    onChange={(e) => setNewPublicVisible(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-vc-coral focus:ring-vc-coral"
                  />
                  <span className="text-sm text-gray-700">
                    Show on public calendar + iCal feed
                    <span className="block text-xs text-gray-400 mt-0.5">
                      Untick for sensitive rooms (e.g. counseling). Has no
                      effect if the org-wide public calendar is disabled.
                    </span>
                  </span>
                </label>
              </div>
            </div>
            {createError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {createError}
              </div>
            )}
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
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
