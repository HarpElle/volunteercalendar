"use client";

/**
 * Room Dashboard Wall View — Wave 9 P0-5 sub-PR E.
 *
 * Large-format display intended for an unattended wall-mount tablet
 * or monitor in (or just outside) a children's room. Renders a
 * traffic-light ratio status, current child + volunteer counts,
 * two-deep state, and any active warning / violation message.
 *
 * Auth: same room view token as the existing roster page (?token=
 *  + ?church_id=). Read-only.
 *
 * Polling: every 5s like the roster page. The kiosk's ratio gate is
 * the source of truth; this view is observational.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useWakeLock } from "@/lib/hooks/use-wake-lock";

interface RatioPayload {
  status: "ok" | "warning" | "violation";
  message: string;
  children: number;
  volunteers: number;
  unrelated_adults: number;
  max_children_for_current_volunteers: number | null;
  two_deep_ok: boolean;
  ratio_ok: boolean;
}

interface DashboardData {
  room: { id: string; name: string; capacity: number | null };
  date: string;
  total_checked_in: number;
  total_checked_out: number;
  ratio: RatioPayload;
}

const POLL_INTERVAL_MS = 5_000;

export default function RoomDashboardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = params.roomId as string;
  const token = searchParams.get("token") || "";
  const churchId = searchParams.get("church_id") || "";
  const date =
    searchParams.get("date") || new Date().toISOString().split("T")[0];

  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useWakeLock();

  const fetchData = useCallback(async () => {
    if (!token || !churchId) {
      setError("Missing church_id or token parameter");
      return;
    }
    try {
      const res = await fetch(
        `/api/checkin/room/${roomId}?token=${encodeURIComponent(token)}&church_id=${encodeURIComponent(churchId)}&date=${encodeURIComponent(date)}`,
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error || "Could not load room");
        return;
      }
      const body = (await res.json()) as DashboardData;
      setData(body);
      setError("");
    } catch {
      setError("Network error");
    }
  }, [roomId, token, churchId, date]);

  useEffect(() => {
    void fetchData();
    const t = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchData]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-vc-indigo text-white p-8">
        <div className="text-center">
          <p className="text-2xl font-display font-bold">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-vc-bg-warm">
        <p className="text-2xl text-vc-text-muted">Loading…</p>
      </div>
    );
  }

  const { ratio, room } = data;
  const max = ratio.max_children_for_current_volunteers;
  const childPercent =
    max && max > 0 ? Math.round((ratio.children * 100) / max) : null;

  const statusColors = {
    ok: {
      bg: "bg-vc-sage",
      ring: "ring-vc-sage/40",
      text: "text-white",
      label: "OK",
    },
    warning: {
      bg: "bg-amber-500",
      ring: "ring-amber-500/40",
      text: "text-white",
      label: "WARNING",
    },
    violation: {
      bg: "bg-vc-coral",
      ring: "ring-vc-coral/40",
      text: "text-white",
      label: "OVER",
    },
  };
  const color = statusColors[ratio.status];

  return (
    <div className="min-h-screen flex flex-col bg-vc-bg-warm p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <p className="text-sm uppercase tracking-widest text-vc-text-muted">
          {data.date}
        </p>
        <h1 className="text-5xl font-display font-bold text-vc-indigo mt-1">
          {room.name}
        </h1>
      </div>

      {/* Traffic light — central element */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div
            className={`inline-flex items-center justify-center w-64 h-64 rounded-full ${color.bg} ${color.text} shadow-2xl ring-8 ${color.ring}`}
          >
            <div>
              <p className="text-6xl font-display font-bold tracking-tight">
                {ratio.children}
                {max !== null && (
                  <span className="opacity-70">/{max}</span>
                )}
              </p>
              <p className="text-2xl font-bold uppercase tracking-wider mt-2">
                {color.label}
              </p>
            </div>
          </div>
          {childPercent !== null && (
            <p className="mt-4 text-3xl font-bold text-vc-indigo">
              {childPercent}% full
            </p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Tile label="Children" value={ratio.children} />
        <Tile label="Volunteers" value={ratio.volunteers} />
        <Tile
          label="Two-deep"
          value={ratio.two_deep_ok ? "✓" : "✗"}
          valueClass={ratio.two_deep_ok ? "text-vc-sage" : "text-vc-coral"}
          subValue={`${ratio.unrelated_adults} unrelated`}
        />
      </div>

      {/* Message strip */}
      <div
        className={`rounded-2xl p-5 ${ratio.status === "ok" ? "bg-white" : `${color.bg} ${color.text}`}`}
      >
        <p className="text-xl text-center font-medium">
          {ratio.message || "Room is operating within policy"}
        </p>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  valueClass,
  subValue,
}: {
  label: string;
  value: string | number;
  valueClass?: string;
  subValue?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
      <p className="text-xs uppercase tracking-widest text-vc-text-muted">
        {label}
      </p>
      <p
        className={`text-5xl font-display font-bold mt-2 ${valueClass ?? "text-vc-indigo"}`}
      >
        {value}
      </p>
      {subValue && (
        <p className="text-sm text-vc-text-muted mt-1">{subValue}</p>
      )}
    </div>
  );
}
