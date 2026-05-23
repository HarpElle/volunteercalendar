"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { todayInTimezone } from "@/lib/utils/date";

interface SharedRoom {
  id: string;
  name: string;
  capacity?: number;
  church_id: string;
  church_name: string;
}

interface SharedReservation {
  id: string;
  church_id: string;
  church_name: string;
  room_id: string;
  room_name: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

function formatDateLong(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split("T")[0];
}

function sundayOfWeek(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return dt.toISOString().split("T")[0];
}

/**
 * /dashboard/rooms/facility/[groupId] — Shared facility calendar.
 *
 * Shows rooms + reservations across every org in a facility group
 * (excluding the requesting org's own — those are visible at /calendar).
 * Phase 5.9's cross-org visibility check resolves here.
 */
export default function FacilityCalendarPage() {
  const params = useParams();
  const groupId = params.groupId as string;
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [churchTimezone, setChurchTimezone] = useState<string>("UTC");
  const [groupName, setGroupName] = useState<string>("");
  const [rooms, setRooms] = useState<SharedRoom[]>([]);
  const [reservations, setReservations] = useState<SharedReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Anchor week starts unset until we know the church TZ.
  const [weekStart, setWeekStart] = useState<string | null>(null);

  // Load church TZ + facility group name
  useEffect(() => {
    if (!user || !churchId) return;
    (async () => {
      try {
        const churchSnap = await getDoc(doc(db, "churches", churchId));
        if (churchSnap.exists()) {
          const tz = churchSnap.data().timezone as string | undefined;
          if (tz) setChurchTimezone(tz);
        }
        const groupSnap = await getDoc(doc(db, "facility_groups", groupId));
        if (groupSnap.exists()) {
          setGroupName((groupSnap.data().name as string) || "Facility Group");
        }
      } catch {
        // Non-critical
      }
    })();
  }, [user, churchId, groupId]);

  // Snap the week to church-local today once TZ loads
  useEffect(() => {
    if (churchTimezone === "UTC" && !weekStart) {
      // Not yet loaded — still set to today-in-UTC as a placeholder so the
      // empty render isn't a permanent spinner. The next effect re-snaps.
    }
    setWeekStart(sundayOfWeek(todayInTimezone(churchTimezone)));
  }, [churchTimezone, weekStart]);

  const fetchData = useCallback(async () => {
    if (!user || !churchId || !weekStart) return;
    setError(null);
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const dateFrom = weekStart;
      const dateTo = addDays(weekStart, 6);
      const res = await fetch(
        `/api/facility/reservations?church_id=${encodeURIComponent(churchId)}&facility_group_id=${encodeURIComponent(groupId)}&date_from=${dateFrom}&date_to=${dateTo}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to load (${res.status})`);
        return;
      }
      const json = await res.json();
      setRooms(json.rooms || []);
      setReservations(json.reservations || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user, churchId, groupId, weekStart]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const weekDays = useMemo(
    () => (weekStart ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : []),
    [weekStart],
  );

  const byDate = useMemo(() => {
    const m = new Map<string, SharedReservation[]>();
    for (const r of reservations) {
      if (!m.has(r.date)) m.set(r.date, []);
      m.get(r.date)!.push(r);
    }
    // sort each day by time
    for (const list of m.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return m;
  }, [reservations]);

  const roomsByChurch = useMemo(() => {
    const m = new Map<string, SharedRoom[]>();
    for (const r of rooms) {
      const key = `${r.church_id}|${r.church_name}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return m;
  }, [rooms]);

  if (!churchId) return null;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard/org/campuses"
          className="text-sm text-vc-text-muted hover:text-vc-coral"
        >
          ← Back to Campuses
        </Link>
        <h1 className="mt-2 font-display text-2xl text-vc-indigo">
          {groupName || "Shared Facility Calendar"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Rooms and reservations from partner organizations in this facility
          group. Your own org's rooms appear at{" "}
          <Link href="/dashboard/rooms/calendar" className="text-vc-coral underline">
            Rooms → Calendar
          </Link>
          .
        </p>
      </div>

      {/* Linked rooms summary */}
      {roomsByChurch.size === 0 && !loading && !error ? (
        <div className="mb-6 rounded-xl border border-vc-border-light bg-vc-bg-warm p-5 text-sm text-vc-text-secondary">
          <p className="font-medium text-vc-indigo mb-1">
            No shared rooms yet.
          </p>
          <p>
            Partner organizations need to tag at least one room with this
            facility group in their{" "}
            <Link
              href="/dashboard/rooms"
              className="text-vc-coral underline"
            >
              Room Settings
            </Link>
            . Until then, this calendar is empty.
          </p>
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-vc-border-light bg-vc-bg-warm p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-vc-text-muted mb-2">
            Shared rooms in this group
          </p>
          <div className="space-y-2">
            {[...roomsByChurch.entries()].map(([key, churchRooms]) => {
              const [, churchName] = key.split("|");
              return (
                <div key={key} className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-vc-indigo">
                    {churchName}:
                  </span>
                  {churchRooms.map((r) => (
                    <Badge key={r.id} variant="default">
                      {r.name}
                    </Badge>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => weekStart && setWeekStart(addDays(weekStart, -7))}
          disabled={!weekStart || loading}
          className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-40"
        >
          ←
        </button>
        <h2 className="text-lg font-semibold text-vc-indigo font-display">
          {weekStart
            ? `${formatDateLong(weekStart)} – ${formatDateLong(addDays(weekStart, 6))}`
            : "Loading…"}
        </h2>
        <button
          onClick={() => weekStart && setWeekStart(addDays(weekStart, 7))}
          disabled={!weekStart || loading}
          className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-40"
        >
          →
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          {weekDays.map((dateStr) => {
            const today = todayInTimezone(churchTimezone);
            const isToday = dateStr === today;
            const dayReservations = byDate.get(dateStr) || [];
            return (
              <div
                key={dateStr}
                className={`rounded-xl border bg-white p-4 ${
                  isToday ? "border-vc-coral/30" : "border-gray-200"
                }`}
              >
                <h3
                  className={`text-sm font-semibold mb-2 ${
                    isToday ? "text-vc-coral" : "text-gray-500"
                  }`}
                >
                  {formatDateLong(dateStr)}
                  {isToday && (
                    <span className="ml-2 text-xs font-normal text-vc-coral/70">
                      Today
                    </span>
                  )}
                </h3>
                {dayReservations.length === 0 ? (
                  <p className="text-xs text-gray-300">No reservations</p>
                ) : (
                  <div className="space-y-1">
                    {dayReservations.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 text-sm"
                      >
                        <span className="text-gray-400 text-xs w-28 shrink-0">
                          {formatTime12(r.start_time)} – {formatTime12(r.end_time)}
                        </span>
                        <span className="text-vc-indigo font-medium truncate">
                          {r.title}
                        </span>
                        <span className="text-gray-400 text-xs shrink-0">
                          {r.room_name} · {r.church_name}
                        </span>
                        {r.status === "pending_approval" && (
                          <Badge variant="warning">Pending</Badge>
                        )}
                      </div>
                    ))}
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
