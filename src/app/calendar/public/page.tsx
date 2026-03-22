"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

interface PublicReservation {
  id: string;
  title: string;
  room_id: string;
  date: string;
  start_time: string;
  end_time: string;
  room_name?: string;
}

interface PublicRoom {
  id: string;
  name: string;
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

/**
 * /calendar/public — Public calendar (no auth required).
 *
 * Query params:
 *   church_id  — required
 *   token      — roomSettings public_calendar_token
 *   embed      — optional, if "true" hides header for iframe embedding
 */
export default function PublicCalendarPage() {
  const searchParams = useSearchParams();
  const churchId = searchParams.get("church_id") || "";
  const token = searchParams.get("token") || "";
  const embed = searchParams.get("embed") === "true";

  const [reservations, setReservations] = useState<PublicReservation[]>([]);
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d;
  });

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentWeekStart]);

  const fetchData = useCallback(async () => {
    if (!churchId || !token) return;
    setLoading(true);
    try {
      // Use the church-wide iCal endpoint data isn't practical for JSON...
      // Instead, we fetch from the reservations API using token-based access
      // For public calendar we need a lightweight public endpoint
      // Reuse display API pattern but for all rooms
      const dateFrom = weekDays[0].toISOString().split("T")[0];
      const dateTo = weekDays[6].toISOString().split("T")[0];

      const res = await fetch(
        `/api/reservations?church_id=${encodeURIComponent(churchId)}&date_from=${dateFrom}&date_to=${dateTo}&public_token=${encodeURIComponent(token)}`,
      );

      if (!res.ok) {
        // Fallback: if public token access not supported, show message
        setError("Public calendar not available");
        setLoading(false);
        return;
      }

      const json = await res.json();
      setReservations(json.reservations || []);
      if (json.rooms) setRooms(json.rooms);
    } catch {
      setError("Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [churchId, token, weekDays]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function navigate(dir: -1 | 1) {
    setCurrentWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7 * dir);
      return d;
    });
  }

  // Build room map
  const roomMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rooms) m.set(r.id, r.name);
    return m;
  }, [rooms]);

  // Group by date
  const byDate = useMemo(() => {
    const map = new Map<string, PublicReservation[]>();
    for (const r of reservations) {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date)!.push(r);
    }
    return map;
  }, [reservations]);

  if (!churchId || !token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-vc-bg">
        <p className="text-gray-500">Missing church_id or token parameter.</p>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div
      className={`min-h-screen bg-vc-bg font-sans ${embed ? "p-2" : "p-4 sm:p-6 lg:p-8"}`}
    >
      {!embed && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-vc-indigo font-display">
            Room Calendar
          </h1>
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center gap-3 mb-4">
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
        <h2 className="text-lg font-semibold text-vc-indigo font-display">
          {weekDays[0].toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}{" "}
          &ndash;{" "}
          {weekDays[6].toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
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
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-vc-coral/30 border-t-vc-coral rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {weekDays.map((day) => {
            const dateStr = day.toISOString().split("T")[0];
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
                  {day.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
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
                          {formatTime12(r.start_time)} &ndash;{" "}
                          {formatTime12(r.end_time)}
                        </span>
                        <span className="text-vc-indigo font-medium truncate">
                          {r.title}
                        </span>
                        <span className="text-gray-400 text-xs shrink-0">
                          {r.room_name || roomMap.get(r.room_id) || ""}
                        </span>
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
