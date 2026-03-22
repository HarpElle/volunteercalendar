"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";

interface CalendarReservation {
  id: string;
  title: string;
  room_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  requested_by_name: string;
}

interface RoomOption {
  id: string;
  name: string;
}

type ViewMode = "month" | "week";

interface RoomCalendarViewProps {
  churchId: string;
  onBookRoom?: () => void;
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

function getMonthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days: Date[] = [];

  // Pad start with previous month days
  const startDay = first.getDay();
  for (let i = startDay - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  // Current month days
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // Pad end to complete the grid (42 = 6 rows)
  while (days.length < 42) {
    days.push(new Date(year, month + 1, days.length - last.getDate() - startDay + 1));
  }

  return days;
}

function getWeekDays(baseDate: Date): Date[] {
  const day = baseDate.getDay();
  const start = new Date(baseDate);
  start.setDate(start.getDate() - day);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function RoomCalendarView({ churchId, onBookRoom }: RoomCalendarViewProps) {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [reservations, setReservations] = useState<CalendarReservation[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [filterRoomId, setFilterRoomId] = useState("");
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Date range for query
  const dateRange = useMemo(() => {
    if (viewMode === "week") {
      const days = getWeekDays(currentDate);
      return { from: toDateStr(days[0]), to: toDateStr(days[6]) };
    }
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    return { from: toDateStr(first), to: toDateStr(last) };
  }, [viewMode, currentDate, year, month]);

  const fetchData = useCallback(async () => {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({
        church_id: churchId,
        date_from: dateRange.from,
        date_to: dateRange.to,
      });
      if (filterRoomId) params.set("room_id", filterRoomId);

      const [resRes, roomsRes] = await Promise.all([
        fetch(`/api/reservations?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        rooms.length === 0
          ? fetch(`/api/rooms?church_id=${encodeURIComponent(churchId)}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          : Promise.resolve(null),
      ]);

      if (resRes.ok) {
        const json = await resRes.json();
        setReservations(json.reservations || []);
      }
      if (roomsRes?.ok) {
        const json = await roomsRes.json();
        setRooms(json.rooms || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, churchId, dateRange, filterRoomId, rooms.length]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build room name map
  const roomMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rooms) m.set(r.id, r.name);
    return m;
  }, [rooms]);

  // Group reservations by date
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarReservation[]>();
    for (const r of reservations) {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date)!.push(r);
    }
    return map;
  }, [reservations]);

  function navigate(dir: -1 | 1) {
    const d = new Date(currentDate);
    if (viewMode === "month") {
      d.setMonth(d.getMonth() + dir);
    } else {
      d.setDate(d.getDate() + 7 * dir);
    }
    setCurrentDate(d);
  }

  const today = toDateStr(new Date());
  const days =
    viewMode === "month"
      ? getMonthDays(year, month)
      : getWeekDays(currentDate);

  const headerLabel =
    viewMode === "month"
      ? currentDate.toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })
      : `Week of ${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5 8.25 12l7.5-7.5"
              />
            </svg>
          </button>
          <h2 className="text-lg font-semibold text-vc-indigo font-display min-w-[180px] text-center">
            {headerLabel}
          </h2>
          <button
            onClick={() => navigate(1)}
            className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m8.25 4.5 7.5 7.5-7.5 7.5"
              />
            </svg>
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Room filter */}
          <select
            value={filterRoomId}
            onChange={(e) => setFilterRoomId(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-vc-coral outline-none min-h-[44px]"
          >
            <option value="">All Rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-2 text-xs font-medium min-h-[44px] ${
                viewMode === "month"
                  ? "bg-vc-coral text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-2 text-xs font-medium min-h-[44px] ${
                viewMode === "week"
                  ? "bg-vc-coral text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Week
            </button>
          </div>

          {onBookRoom && (
            <button
              onClick={onBookRoom}
              className="rounded-lg bg-vc-coral px-4 py-2 text-sm font-medium text-white hover:bg-vc-coral/90 transition-colors min-h-[44px]"
            >
              Book Room
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-vc-coral/30 border-t-vc-coral rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-xs font-medium text-gray-500 text-center border-r border-gray-50 last:border-r-0"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className={`grid grid-cols-7 ${viewMode === "week" ? "" : "auto-rows-[100px]"}`}>
            {days.map((day, idx) => {
              const dateStr = toDateStr(day);
              const isToday = dateStr === today;
              const isCurrentMonth = day.getMonth() === month;
              const dayReservations = byDate.get(dateStr) || [];

              return (
                <div
                  key={idx}
                  className={`border-r border-b border-gray-50 last:border-r-0 p-1 ${
                    viewMode === "week" ? "min-h-[120px]" : ""
                  } ${!isCurrentMonth && viewMode === "month" ? "bg-gray-50/50" : ""}`}
                >
                  <p
                    className={`text-xs font-medium mb-1 px-1 ${
                      isToday
                        ? "text-white bg-vc-coral rounded-full w-6 h-6 flex items-center justify-center"
                        : isCurrentMonth
                          ? "text-gray-700"
                          : "text-gray-300"
                    }`}
                  >
                    {day.getDate()}
                  </p>
                  <div className="space-y-0.5">
                    {dayReservations.slice(0, 3).map((r) => (
                      <div
                        key={r.id}
                        className={`rounded px-1.5 py-0.5 text-[10px] leading-tight truncate ${
                          r.status === "confirmed"
                            ? "bg-vc-sage/15 text-vc-sage"
                            : r.status === "pending_approval"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-100 text-gray-500"
                        }`}
                        title={`${r.title} (${formatTime12(r.start_time)}-${formatTime12(r.end_time)}) ${roomMap.get(r.room_id) || ""}`}
                      >
                        {r.title}
                      </div>
                    ))}
                    {dayReservations.length > 3 && (
                      <p className="text-[10px] text-gray-400 px-1">
                        +{dayReservations.length - 3} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
