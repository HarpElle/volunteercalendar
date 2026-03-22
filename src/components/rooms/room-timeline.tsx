"use client";

import { useMemo } from "react";

interface TimelineReservation {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  status: string;
  requested_by_name: string;
}

interface RoomTimelineProps {
  reservations: TimelineReservation[];
  /** Start hour of timeline (default 6) */
  startHour?: number;
  /** End hour of timeline (default 22) */
  endHour?: number;
}

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

/**
 * Single-day horizontal time strip with positioned blocks.
 * Shows a current-time indicator line.
 */
export function RoomTimeline({
  reservations,
  startHour = 6,
  endHour = 22,
}: RoomTimelineProps) {
  const totalMinutes = (endHour - startHour) * 60;
  const startMinutes = startHour * 60;

  // Current time indicator
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentPercent =
    ((currentMinutes - startMinutes) / totalMinutes) * 100;
  const showCurrentLine =
    currentMinutes >= startMinutes &&
    currentMinutes <= endHour * 60;

  // Hour markers
  const hours = useMemo(() => {
    const h: number[] = [];
    for (let i = startHour; i <= endHour; i++) h.push(i);
    return h;
  }, [startHour, endHour]);

  return (
    <div className="relative">
      {/* Hour labels */}
      <div className="relative h-6 mb-1">
        {hours.map((h) => {
          const pct = ((h - startHour) / (endHour - startHour)) * 100;
          const label =
            h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
          return (
            <span
              key={h}
              className="absolute text-[10px] text-gray-400 -translate-x-1/2"
              style={{ left: `${pct}%` }}
            >
              {label}
            </span>
          );
        })}
      </div>

      {/* Timeline bar */}
      <div className="relative h-12 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
        {/* Hour grid lines */}
        {hours.map((h) => {
          const pct = ((h - startHour) / (endHour - startHour)) * 100;
          return (
            <div
              key={h}
              className="absolute top-0 bottom-0 w-px bg-gray-200"
              style={{ left: `${pct}%` }}
            />
          );
        })}

        {/* Reservation blocks */}
        {reservations.map((r) => {
          const rStart = timeToMinutes(r.start_time);
          const rEnd = timeToMinutes(r.end_time);
          const left = Math.max(
            0,
            ((rStart - startMinutes) / totalMinutes) * 100,
          );
          const width = Math.min(
            100 - left,
            ((rEnd - rStart) / totalMinutes) * 100,
          );

          const colorClass =
            r.status === "confirmed"
              ? "bg-vc-sage/70"
              : r.status === "pending_approval"
                ? "bg-amber-400/70"
                : "bg-gray-300";

          return (
            <div
              key={r.id}
              className={`absolute top-1 bottom-1 rounded ${colorClass} flex items-center px-1.5 overflow-hidden`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${r.title} (${formatTime12(r.start_time)}-${formatTime12(r.end_time)}) — ${r.requested_by_name}`}
            >
              <span className="text-[10px] text-white font-medium truncate">
                {r.title}
              </span>
            </div>
          );
        })}

        {/* Current time indicator */}
        {showCurrentLine && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-vc-coral z-10"
            style={{ left: `${currentPercent}%` }}
          >
            <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-vc-coral" />
          </div>
        )}
      </div>
    </div>
  );
}
