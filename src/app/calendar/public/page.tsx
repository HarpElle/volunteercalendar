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
  room_name?: string | null;
}

interface PublicRoom {
  id: string;
  name: string;
}

interface PublicCalendarResponse {
  church: { id: string; name: string; timezone: string };
  rooms: PublicRoom[];
  reservations: PublicReservation[];
  today: string;
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

/** Format a YYYY-MM-DD string for display, anchored at local noon to avoid
 *  the UTC-rollover surprise PR #14 fixed. */
function formatLocalDate(
  iso: string,
  opts: Intl.DateTimeFormatOptions,
): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, opts);
}

/** Sunday-of-week relative to a YYYY-MM-DD anchor. */
function sundayOfWeek(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().split("T")[0];
}

/** Add N days to a YYYY-MM-DD string. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split("T")[0];
}

/**
 * /calendar/public — Public calendar (no auth required).
 *
 * Query params:
 *   token      — roomSettings.public_calendar_token (required)
 *   church_id  — optional. Auto-resolved from the token if missing.
 *   embed      — optional. "true" hides the header for iframe embedding.
 */
export default function PublicCalendarPage() {
  const searchParams = useSearchParams();
  const churchIdParam = searchParams.get("church_id") || "";
  const token = searchParams.get("token") || "";
  const embed = searchParams.get("embed") === "true";

  const [data, setData] = useState<PublicCalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Anchor day for the week view. Starts unset; once the API returns the
  // church's "today" (in church TZ) we snap to that week's Sunday.
  const [weekStart, setWeekStart] = useState<string | null>(null);

  const fetchData = useCallback(
    async (anchor?: string) => {
      if (!token) {
        setError("Missing token parameter.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ token });
        if (churchIdParam) params.set("church_id", churchIdParam);
        if (anchor) {
          params.set("date_from", anchor);
          params.set("date_to", addDays(anchor, 6));
        }
        const res = await fetch(
          `/api/calendar/public?${params.toString()}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || `Public calendar not available (${res.status})`);
          return;
        }
        const json = (await res.json()) as PublicCalendarResponse;
        setData(json);
        // First load: snap the week view to the church's today
        if (!anchor) {
          setWeekStart(sundayOfWeek(json.today));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load calendar");
      } finally {
        setLoading(false);
      }
    },
    [token, churchIdParam],
  );

  // Initial load — resolves church metadata + today + first week
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  // Re-fetch when navigating between weeks
  useEffect(() => {
    if (!weekStart) return;
    fetchData(weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const weekDays = useMemo(() => {
    if (!weekStart) return [];
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  function navigate(dir: -1 | 1) {
    if (!weekStart) return;
    setWeekStart(addDays(weekStart, 7 * dir));
  }

  const byDate = useMemo(() => {
    const map = new Map<string, PublicReservation[]>();
    if (!data) return map;
    for (const r of data.reservations) {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date)!.push(r);
    }
    return map;
  }, [data]);

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-vc-bg">
        <p className="text-gray-500">Missing token parameter.</p>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-vc-bg font-sans ${embed ? "p-2" : "p-4 sm:p-6 lg:p-8"}`}
    >
      {!embed && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-vc-indigo font-display">
            {data?.church?.name ? `${data.church.name} — Room Calendar` : "Room Calendar"}
          </h1>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate(-1)}
          disabled={!weekStart || loading}
          className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-40"
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
          {weekStart ? (
            <>
              {formatLocalDate(weekStart, {
                month: "short",
                day: "numeric",
              })}{" "}
              &ndash;{" "}
              {formatLocalDate(addDays(weekStart, 6), {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </>
          ) : (
            "Loading…"
          )}
        </h2>
        <button
          onClick={() => navigate(1)}
          disabled={!weekStart || loading}
          className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-40"
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

      {loading && weekDays.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-vc-coral/30 border-t-vc-coral rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {weekDays.map((dateStr) => {
            const isToday = dateStr === data?.today;
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
                  {formatLocalDate(dateStr, {
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
                          {r.room_name || ""}
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
