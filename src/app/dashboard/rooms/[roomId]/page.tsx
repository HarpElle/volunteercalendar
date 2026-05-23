"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { todayInTimezone } from "@/lib/utils/date";
import { getChurchFacilityGroups } from "@/lib/firebase/firestore";
import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { TabBar } from "@/components/ui/tab-bar";
import { RoomBookingForm } from "@/components/rooms/room-booking-form";
import { TIER_LIMITS } from "@/lib/constants";
import type { SubscriptionTier } from "@/lib/types";

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
  requires_approval?: boolean;
  /** Links this room to a shared facility group. When set, the room and
   *  its reservations are visible to other orgs in the group via the
   *  shared facility calendar. */
  facility_group_id?: string | null;
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
  recurrence_group_id?: string;
}

/** Edit scope choices for recurring reservation actions. */
type EditScope = "single_date" | "from_date" | "all";

interface OccurrenceAction {
  mode: "edit" | "cancel";
  reservation: ReservationItem;
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
  const [editEquipment, setEditEquipment] = useState<string[]>([]);
  const [editRequiresApproval, setEditRequiresApproval] = useState(false);
  const [editPublicVisible, setEditPublicVisible] = useState(true);
  const [editFacilityGroupId, setEditFacilityGroupId] = useState<string>("");
  const [facilityGroups, setFacilityGroups] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [equipmentTags, setEquipmentTags] = useState<string[]>([]);
  const [copiedIcal, setCopiedIcal] = useState(false);
  const [copiedDisplay, setCopiedDisplay] = useState(false);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [tier, setTier] = useState<SubscriptionTier>("free");
  // null until the church doc loads, so the reservations fetch can defer
  // and avoid an off-by-one UTC-today flash before the church TZ is known.
  const [churchTimezone, setChurchTimezone] = useState<string | null>(null);
  const [reservationsError, setReservationsError] = useState<string | null>(null);
  /** Days into the future to show. Default covers most quarterly recurring
   *  series; "Show full year" pushes to 365. */
  const [rangeDays, setRangeDays] = useState<number>(180);
  /** Currently-open occurrence-action modal (edit time or cancel). */
  const [actionTarget, setActionTarget] = useState<OccurrenceAction | null>(null);

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
    // Wait until we know the church's timezone — otherwise the very first
    // load can briefly query a UTC-rolled-forward date and show "no
    // reservations" before the real list comes in (the PR #22 fix narrowed
    // this to a single flash; this gate eliminates it).
    if (!churchTimezone) return;
    setReservationsError(null);
    try {
      const token = await user.getIdToken();
      // "Today" must be computed in the church's timezone — same UTC-rollover
      // trap the wall-display API just got fixed for. The range end is set
      // by adding rangeDays to the church-local today, then formatted back.
      const today = todayInTimezone(churchTimezone);
      const endParts = today.split("-").map(Number);
      const endDate = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));
      endDate.setUTCDate(endDate.getUTCDate() + rangeDays);
      const endStr = endDate.toISOString().split("T")[0];
      const res = await fetch(
        `/api/reservations?church_id=${encodeURIComponent(churchId)}&room_id=${roomId}&date_from=${today}&date_to=${endStr}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setReservations(json.reservations || []);
      } else {
        const data = await res.json().catch(() => ({}));
        setReservationsError(
          data.error || `Failed to load reservations (${res.status})`,
        );
      }
    } catch (e) {
      setReservationsError(
        e instanceof Error ? e.message : "Failed to load reservations",
      );
    }
  }, [user, churchId, roomId, rangeDays, churchTimezone]);

  useEffect(() => {
    fetchRoom();
    fetchReservations();
  }, [fetchRoom, fetchReservations]);

  // Load tier (for recurring gating) + global equipment tags for the edit form.
  // Tier comes from the church doc directly because /api/church-info is a
  // public endpoint that doesn't expose subscription_tier (mirrors the
  // pattern in /calendar/page.tsx).
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
          const data = tierSnap.data();
          const t = data.subscription_tier as SubscriptionTier | undefined;
          if (t) setTier(t);
          const tz = data.timezone as string | undefined;
          if (tz) setChurchTimezone(tz);
        }
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          const tags = s.settings?.equipment_tags || s.equipment_tags || [];
          setEquipmentTags(tags);
        }

        // Load org's active facility groups for the Edit Room dropdown.
        const groups = await getChurchFacilityGroups(churchId);
        const active = groups
          .filter((g) => g.membership.status === "active")
          .map((g) => ({ id: g.id, name: g.name }));
        setFacilityGroups(active);
      } catch {
        // Non-critical
      }
    })();
  }, [user, churchId]);

  function startEdit() {
    if (!room) return;
    setEditName(room.name);
    setEditLocation(room.location || "");
    setEditCapacity(room.capacity?.toString() || "");
    setEditEquipment(room.equipment || []);
    setEditRequiresApproval(!!room.requires_approval);
    // Treat undefined as public so old rooms (pre-PR-24) default to visible
    // when first edited, matching the new POST default.
    setEditPublicVisible(room.public_visible !== false);
    setEditFacilityGroupId(room.facility_group_id || "");
    setEditing(true);
  }

  function toggleEditEquipment(item: string) {
    setEditEquipment((prev) =>
      prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item],
    );
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
          equipment: editEquipment,
          requires_approval: editRequiresApproval,
          public_visible: editPublicVisible,
          // Empty string means "no group" — persist null so the filter
          // `where("facility_group_id", "==", X)` in /api/facility/reservations
          // doesn't accidentally match other rooms whose field is null.
          facility_group_id: editFacilityGroupId || null,
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

  const recurringEnabled = TIER_LIMITS[tier]?.rooms_recurring ?? false;

  // URL builders used both for visible inputs (so admins can read/share/open)
  // and for the Copy actions. Codex Phase 5 feedback (2026-05-17): the
  // previous "Copy on click only" buttons left admins blind to the actual
  // URL, which made the wall-display + iCal flows hard to verify.
  const icalUrl =
    room?.calendar_token && typeof window !== "undefined"
      ? `${window.location.origin.replace(/^http:\/\//, "https://")}/api/calendar/room/${roomId}/${room.calendar_token}`
      : "";
  const displayUrl =
    room?.calendar_token && churchId && typeof window !== "undefined"
      ? `${window.location.origin}/display/room/${roomId}?token=${room.calendar_token}&church_id=${churchId}`
      : "";

  function copyIcalUrl() {
    if (!icalUrl) return;
    navigator.clipboard.writeText(icalUrl);
    setCopiedIcal(true);
    setTimeout(() => setCopiedIcal(false), 2000);
  }

  function copyDisplayUrl() {
    if (!displayUrl) return;
    navigator.clipboard.writeText(displayUrl);
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
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-vc-indigo font-display">
            {room.name}
          </h1>
          {room.location && (
            <p className="text-sm text-gray-400 mt-0.5">{room.location}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {room.capacity && (
              <Badge variant="default">Capacity: {room.capacity}</Badge>
            )}
            {room.requires_approval && (
              <Badge variant="warning">Requires approval</Badge>
            )}
            {!room.is_active && <Badge variant="danger">Inactive</Badge>}
          </div>
        </div>
        <button
          onClick={() => setShowBookingForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-vc-coral px-4 py-2.5 text-sm font-medium text-white hover:bg-vc-coral/90 transition-colors min-h-[44px]"
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
          Book this room
        </button>
      </div>

      {showBookingForm && churchId && (
        <RoomBookingForm
          churchId={churchId}
          initialRoomId={roomId}
          recurringEnabled={recurringEnabled}
          onClose={() => setShowBookingForm(false)}
          onCreated={() => {
            setShowBookingForm(false);
            fetchReservations();
          }}
        />
      )}

      {/* Visible URLs panel — Display + iCal */}
      {room.calendar_token && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-vc-bg-warm/40 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 mb-1">
              Wall Display URL
            </p>
            <p className="break-all font-mono text-xs text-vc-indigo">
              {displayUrl}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <a
                href={displayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-vc-coral text-vc-coral px-3 py-1.5 text-xs font-medium hover:bg-vc-coral/5 transition-colors"
              >
                Open
              </a>
              <button
                onClick={copyDisplayUrl}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {copiedDisplay ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-vc-bg-warm/40 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 mb-1">
              iCal Feed URL
            </p>
            <p className="break-all font-mono text-xs text-vc-indigo">
              {icalUrl}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <a
                href={icalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-vc-coral text-vc-coral px-3 py-1.5 text-xs font-medium hover:bg-vc-coral/5 transition-colors"
              >
                Open
              </a>
              <button
                onClick={copyIcalUrl}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {copiedIcal ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {reservationsError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {reservationsError}
        </div>
      )}

      {/* Date range chips — apply to both Timeline + Reservations tabs */}
      {(activeTab === "timeline" || activeTab === "reservations") && (
        <div className="mt-4 flex items-center gap-2 text-xs">
          <span className="text-gray-400">Window:</span>
          {[
            { label: "30d", days: 30 },
            { label: "90d", days: 90 },
            { label: "6mo", days: 180 },
            { label: "1yr", days: 365 },
          ].map(({ label, days }) => (
            <button
              key={days}
              type="button"
              onClick={() => setRangeDays(days)}
              className={`rounded-full border px-3 py-1 transition-colors ${
                rangeDays === days
                  ? "border-vc-coral bg-vc-coral/10 text-vc-coral"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
          <span className="text-gray-300">·</span>
          <span className="text-gray-400">
            {reservations.length}{" "}
            {reservations.length === 1 ? "reservation" : "reservations"}
          </span>
        </div>
      )}

      <div className="mt-4">
        {/* Timeline Tab */}
        {activeTab === "timeline" && (
          <div>
            {sortedDates.length === 0 ? (
              <p className="text-gray-400 text-sm py-8 text-center">
                No upcoming reservations in the next {rangeDays} days
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
                          year: "numeric",
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
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-vc-indigo truncate">
                                {r.title}
                              </p>
                              {r.status === "pending_approval" && (
                                <Badge variant="warning">Pending</Badge>
                              )}
                              {r.status === "denied" && (
                                <Badge variant="danger">Denied</Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">
                              {r.requested_by_name}
                              {r.is_recurring && " (recurring)"}
                            </p>
                          </div>
                          <span className="text-sm text-gray-500 shrink-0">
                            {formatTime12(r.start_time)} &ndash;{" "}
                            {formatTime12(r.end_time)}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setActionTarget({ mode: "edit", reservation: r })
                              }
                              className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-vc-coral hover:text-vc-coral transition-colors"
                              title="Edit reservation"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setActionTarget({
                                  mode: "cancel",
                                  reservation: r,
                                })
                              }
                              className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-red-400 hover:text-red-600 transition-colors"
                              title="Cancel reservation"
                            >
                              Cancel
                            </button>
                          </div>
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
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm mb-3">
                  No reservations in the next {rangeDays} days
                </p>
                <button
                  onClick={() => setShowBookingForm(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-vc-coral px-4 py-2.5 text-sm font-medium text-white hover:bg-vc-coral/90 transition-colors"
                >
                  Book this room
                </button>
              </div>
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
                      <th className="px-4 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
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
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
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
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setActionTarget({ mode: "edit", reservation: r })
                              }
                              className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-vc-coral hover:text-vc-coral transition-colors"
                              title="Edit reservation"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setActionTarget({
                                  mode: "cancel",
                                  reservation: r,
                                })
                              }
                              className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-red-400 hover:text-red-600 transition-colors"
                              title="Cancel reservation"
                            >
                              Cancel
                            </button>
                          </div>
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Equipment
                  </label>
                  {equipmentTags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {equipmentTags.map((tag) => {
                        const on = editEquipment.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleEditEquipment(tag)}
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
                      Add equipment tags in Room Settings (Settings → Campuses).
                    </p>
                  )}
                </div>

                <div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editRequiresApproval}
                      onChange={(e) =>
                        setEditRequiresApproval(e.target.checked)
                      }
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

                <div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editPublicVisible}
                      onChange={(e) =>
                        setEditPublicVisible(e.target.checked)
                      }
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-vc-coral focus:ring-vc-coral"
                    />
                    <span className="text-sm text-gray-700">
                      Show on public calendar + iCal feed
                      <span className="block text-xs text-gray-400 mt-0.5">
                        Untick for sensitive rooms. Has no effect if the org-wide
                        public calendar is disabled.
                      </span>
                    </span>
                  </label>
                </div>

                {/* Shared facility group selector. Tagging a room with a
                    facility group makes it visible to other orgs in the
                    same group via the facility calendar at
                    /dashboard/rooms/facility/[groupId]. Only the active
                    facility groups this org belongs to are listed. */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Shared facility group
                  </label>
                  {facilityGroups.length > 0 ? (
                    <>
                      <select
                        value={editFacilityGroupId}
                        onChange={(e) => setEditFacilityGroupId(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                      >
                        <option value="">(none — not shared cross-org)</option>
                        {facilityGroups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-400 mt-1">
                        When set, partner orgs in this group can see this room
                        and its reservations on the shared facility calendar.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">
                      No facility groups yet.{" "}
                      <Link
                        href="/dashboard/rooms/facility"
                        className="text-vc-coral underline"
                      >
                        Create a group →
                      </Link>
                    </p>
                  )}
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
                    <dt className="text-gray-400">Equipment</dt>
                    <dd className="text-vc-indigo">
                      {room.equipment && room.equipment.length > 0
                        ? room.equipment.join(", ")
                        : "None"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Approval</dt>
                    <dd className="text-vc-indigo">
                      {room.requires_approval
                        ? "Required for this room"
                        : "Org-wide setting applies"}
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

      {/* Per-occurrence Edit / Cancel modal */}
      {actionTarget && churchId && (
        <OccurrenceActionModal
          churchId={churchId}
          action={actionTarget}
          onClose={() => setActionTarget(null)}
          onApplied={() => {
            setActionTarget(null);
            fetchReservations();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Occurrence Edit / Cancel modal
// ---------------------------------------------------------------------------

interface OccurrenceActionModalProps {
  churchId: string;
  action: OccurrenceAction;
  onClose: () => void;
  onApplied: () => void;
}

function OccurrenceActionModal({
  churchId,
  action,
  onClose,
  onApplied,
}: OccurrenceActionModalProps) {
  const { user } = useAuth();
  const r = action.reservation;
  const isRecurring = !!(r.is_recurring && r.recurrence_group_id);
  const [scope, setScope] = useState<EditScope>("single_date");
  const [startTime, setStartTime] = useState(r.start_time);
  const [endTime, setEndTime] = useState(r.end_time);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const niceDate = new Date(r.date + "T12:00:00").toLocaleDateString(
    undefined,
    { weekday: "long", month: "long", day: "numeric", year: "numeric" },
  );

  async function handleSubmit() {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      if (action.mode === "cancel") {
        // DELETE accepts edit_scope of "single" | "from_date" | "all"
        const apiScope =
          scope === "single_date"
            ? "single"
            : scope === "from_date"
              ? "from_date"
              : "all";
        const res = await fetch(
          `/api/reservations/${r.id}?church_id=${encodeURIComponent(churchId)}&edit_scope=${apiScope}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Cancel failed (${res.status})`);
          return;
        }
      } else {
        // PUT accepts edit_scope of "single_date" | "from_date" | "all"
        const body: Record<string, unknown> = {
          church_id: churchId,
          start_time: startTime,
          end_time: endTime,
          edit_scope: scope,
        };
        const res = await fetch(`/api/reservations/${r.id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Save failed (${res.status})`);
          return;
        }
      }
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  const title =
    action.mode === "edit" ? "Edit reservation" : "Cancel reservation";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl mx-4">
        <h2 className="text-lg font-bold text-vc-indigo font-display mb-1">
          {title}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          <span className="font-medium text-vc-indigo">{r.title}</span> ·{" "}
          {niceDate} · {r.start_time}–{r.end_time}
        </p>

        {/* Scope picker — only when recurring */}
        {isRecurring && (
          <div className="mb-4 space-y-2">
            <p className="text-sm font-medium text-gray-700">Apply to:</p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                checked={scope === "single_date"}
                onChange={() => setScope("single_date")}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">This occurrence only</span>
                <span className="block text-xs text-gray-400">
                  Other weeks in the series stay unchanged.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                checked={scope === "from_date"}
                onChange={() => setScope("from_date")}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">From this date forward</span>
                <span className="block text-xs text-gray-400">
                  Applies to this occurrence and every subsequent week.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                checked={scope === "all"}
                onChange={() => setScope("all")}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">All occurrences in series</span>
                <span className="block text-xs text-gray-400">
                  Applies to every occurrence, past and future.
                </span>
              </span>
            </label>
          </div>
        )}

        {/* Edit fields — time only for now */}
        {action.mode === "edit" && (
          <div className="space-y-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Start time
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  End time
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {action.mode === "cancel" && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            This will set the reservation status to{" "}
            <span className="font-medium">cancelled</span>. It cannot be undone
            from this screen.
          </p>
        )}

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              submitting ||
              (action.mode === "edit" &&
                (!startTime || !endTime || startTime >= endTime))
            }
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
              action.mode === "cancel"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-vc-coral hover:bg-vc-coral/90"
            }`}
          >
            {submitting
              ? "Working..."
              : action.mode === "cancel"
                ? "Cancel reservation"
                : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
