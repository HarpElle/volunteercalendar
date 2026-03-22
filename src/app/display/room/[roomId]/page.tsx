"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

interface DisplayReservation {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  ministry_id: string | null;
  requested_by_name: string;
  setup_notes: string;
}

interface DisplayData {
  room: {
    id: string;
    name: string;
    capacity: number | null;
    equipment: string[];
  };
  date: string;
  server_time: string;
  reservations: DisplayReservation[];
}

type RoomStatus = "available" | "in_use" | "starting_soon";

const POLL_INTERVAL = 30_000; // 30 seconds
const CLOCK_INTERVAL = 1_000; // 1 second
const STARTING_SOON_MINUTES = 15;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

function formatCountdown(minutes: number): string {
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${Math.floor(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * /display/room/[roomId] — Room display for wall-mounted tablets.
 *
 * Query params:
 *   token      — room calendar_token (for auth)
 *   church_id  — required
 *
 * Polls /api/display/room/[roomId] every 30s.
 * Shows: room name, current status (Available/In Use), today's schedule,
 * countdown timer. Green=available, coral=in use, amber=starting soon.
 */
export default function RoomDisplayPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const roomId = params.roomId as string;
  const token = searchParams.get("token") || "";
  const churchId = searchParams.get("church_id") || "";

  const [data, setData] = useState<DisplayData | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(new Date());

  const fetchData = useCallback(async () => {
    if (!roomId || !token || !churchId) return;
    try {
      const url = `/api/display/room/${roomId}?token=${encodeURIComponent(token)}&church_id=${encodeURIComponent(churchId)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const json = await res.json();
        setError(json.error || "Failed to load");
        return;
      }
      const json = (await res.json()) as DisplayData;
      setData(json);
      setError("");
    } catch {
      setError("Network error");
    }
  }, [roomId, token, churchId]);

  // Initial fetch + polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Clock tick
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), CLOCK_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Compute current status
  const { status, currentReservation, nextReservation, countdownMinutes } =
    useMemo(() => {
      if (!data)
        return {
          status: "available" as RoomStatus,
          currentReservation: null,
          nextReservation: null,
          countdownMinutes: 0,
        };

      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const reservations = data.reservations;

      // Find current reservation (we're inside its time window)
      const current = reservations.find((r) => {
        const start = timeToMinutes(r.start_time);
        const end = timeToMinutes(r.end_time);
        return nowMinutes >= start && nowMinutes < end;
      });

      if (current) {
        const endMin = timeToMinutes(current.end_time);
        return {
          status: "in_use" as RoomStatus,
          currentReservation: current,
          nextReservation: null,
          countdownMinutes: endMin - nowMinutes,
        };
      }

      // Find next upcoming reservation
      const upcoming = reservations
        .filter((r) => timeToMinutes(r.start_time) > nowMinutes)
        .sort(
          (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time),
        );
      const next = upcoming[0] || null;

      if (next) {
        const startMin = timeToMinutes(next.start_time);
        const minutesUntil = startMin - nowMinutes;

        if (minutesUntil <= STARTING_SOON_MINUTES) {
          return {
            status: "starting_soon" as RoomStatus,
            currentReservation: null,
            nextReservation: next,
            countdownMinutes: minutesUntil,
          };
        }

        return {
          status: "available" as RoomStatus,
          currentReservation: null,
          nextReservation: next,
          countdownMinutes: minutesUntil,
        };
      }

      return {
        status: "available" as RoomStatus,
        currentReservation: null,
        nextReservation: null,
        countdownMinutes: 0,
      };
    }, [data, now]);

  if (!churchId || !token) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <p className="text-gray-400 text-xl">
          Missing church_id or token parameter.
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="text-center">
          <p className="text-red-400 font-medium text-xl mb-3">{error}</p>
          <button
            type="button"
            onClick={fetchData}
            className="text-vc-coral underline font-medium text-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="w-12 h-12 border-4 border-vc-coral/30 border-t-vc-coral rounded-full animate-spin" />
      </div>
    );
  }

  const statusColors = {
    available: "bg-emerald-600",
    in_use: "bg-vc-coral",
    starting_soon: "bg-amber-500",
  };

  const statusLabels = {
    available: "Available",
    in_use: "In Use",
    starting_soon: "Starting Soon",
  };

  const currentTime = now.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className={`flex flex-col h-full transition-colors duration-700 ${statusColors[status]}`}
    >
      {/* Header — room name + clock */}
      <div className="flex items-center justify-between px-8 py-6">
        <h1 className="text-4xl font-bold text-white font-display">
          {data.room.name}
        </h1>
        <p className="text-2xl text-white/80 font-medium">{currentTime}</p>
      </div>

      {/* Status badge */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="text-center">
          <p className="text-7xl font-bold text-white font-display mb-4">
            {statusLabels[status]}
          </p>

          {/* Current reservation info */}
          {status === "in_use" && currentReservation && (
            <div className="text-white/90">
              <p className="text-3xl font-medium mb-2">
                {currentReservation.title}
              </p>
              <p className="text-xl text-white/70">
                {formatTime12(currentReservation.start_time)} &ndash;{" "}
                {formatTime12(currentReservation.end_time)}
              </p>
              <p className="text-2xl font-medium mt-4 text-white/80">
                {formatCountdown(countdownMinutes)} remaining
              </p>
            </div>
          )}

          {/* Starting soon info */}
          {status === "starting_soon" && nextReservation && (
            <div className="text-white/90">
              <p className="text-3xl font-medium mb-2">
                {nextReservation.title}
              </p>
              <p className="text-xl text-white/70">
                Starts at {formatTime12(nextReservation.start_time)}
              </p>
              <p className="text-2xl font-medium mt-4 text-white/80">
                in {formatCountdown(countdownMinutes)}
              </p>
            </div>
          )}

          {/* Available — show next event if any */}
          {status === "available" && nextReservation && (
            <div className="text-white/70 mt-4">
              <p className="text-xl">
                Next: {nextReservation.title} at{" "}
                {formatTime12(nextReservation.start_time)}
              </p>
            </div>
          )}

          {status === "available" && !nextReservation && (
            <p className="text-xl text-white/60 mt-4">
              No more events scheduled today
            </p>
          )}
        </div>
      </div>

      {/* Today's schedule strip */}
      <div className="bg-black/20 px-8 py-4">
        <p className="text-sm text-white/50 uppercase tracking-wide mb-2 font-medium">
          Today&apos;s Schedule
        </p>
        {data.reservations.length === 0 ? (
          <p className="text-white/40 text-sm">No reservations</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-1">
            {data.reservations.map((r) => {
              const isActive =
                currentReservation && currentReservation.id === r.id;
              return (
                <div
                  key={r.id}
                  className={`flex-shrink-0 rounded-lg px-4 py-2 ${
                    isActive
                      ? "bg-white/30 ring-2 ring-white/50"
                      : "bg-white/10"
                  }`}
                >
                  <p className="text-white font-medium text-sm">{r.title}</p>
                  <p className="text-white/60 text-xs">
                    {formatTime12(r.start_time)} &ndash;{" "}
                    {formatTime12(r.end_time)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
