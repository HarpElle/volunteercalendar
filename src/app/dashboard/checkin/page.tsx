"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import Link from "next/link";

interface RoomBreakdown {
  id: string;
  name: string;
  checked_in: number;
  checked_out: number;
  capacity: number | null;
}

interface LiveStats {
  date: string;
  sessions: {
    id: string;
    child_name: string;
    room_name: string;
    checked_in_at: string;
    checked_out_at: string | null;
  }[];
  rooms: RoomBreakdown[];
}

const POLL_INTERVAL = 15_000;

/**
 * /dashboard/checkin — Check-In overview/landing page.
 * Shows today's check-in activity and quick action links.
 */
export default function CheckInDashboardPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);

  const kioskUrl = typeof window !== "undefined" && churchId
    ? `${window.location.origin}/checkin?church_id=${churchId}`
    : "";

  const handleLaunchKiosk = useCallback(() => {
    if (kioskUrl) window.open(kioskUrl, "_blank");
  }, [kioskUrl]);

  const handleCopyKioskUrl = useCallback(async () => {
    if (!kioskUrl) return;
    try {
      await navigator.clipboard.writeText(kioskUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for insecure contexts
      const input = document.createElement("input");
      input.value = kioskUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [kioskUrl]);

  const fetchStats = useCallback(async () => {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(
        `/api/admin/checkin/report?church_id=${churchId}&type=live&date=${today}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, churchId]);

  // Initial load + 15-second polling
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    fetchStats();
    pollRef.current = setInterval(fetchStats, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStats]);

  const handleAdminCheckout = useCallback(async (sessionId: string) => {
    if (!user || !churchId) return;
    setCheckingOutId(sessionId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/checkin/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ church_id: churchId, session_id: sessionId }),
      });
      if (res.ok) {
        await fetchStats();
      }
    } catch {
      // silent
    } finally {
      setCheckingOutId(null);
    }
  }, [user, churchId, fetchStats]);

  const checkedIn = stats?.sessions?.filter((s) => !s.checked_out_at).length ?? 0;
  const checkedOut = stats?.sessions?.filter((s) => s.checked_out_at).length ?? 0;
  const total = stats?.sessions?.length ?? 0;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-vc-indigo font-display">
          Children&apos;s Check-In
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLaunchKiosk}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-vc-coral text-white font-semibold rounded-xl
              hover:bg-vc-coral/90 transition-colors shadow-sm text-sm"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25h-13.5A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25h-13.5A2.25 2.25 0 0 1 3 12V5.25" />
            </svg>
            Launch Kiosk
          </button>
          <button
            type="button"
            onClick={handleCopyKioskUrl}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 border border-vc-border-light text-vc-indigo
              font-medium rounded-xl hover:bg-vc-bg-warm transition-colors text-sm"
            title="Copy kiosk URL for bookmarking on tablets"
          >
            {copied ? (
              <>
                <svg className="h-4 w-4 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
                Copy URL
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Checked In" value={checkedIn} color="text-vc-coral" loading={loading} />
        <StatCard label="Checked Out" value={checkedOut} color="text-vc-sage" loading={loading} />
        <StatCard label="Total Today" value={total} color="text-vc-indigo" loading={loading} />
      </div>

      {/* Room breakdown */}
      {!loading && stats?.rooms && stats.rooms.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-vc-indigo font-display mb-3">
            Rooms
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.rooms.map((room) => {
              const pct = room.capacity ? Math.round((room.checked_in / room.capacity) * 100) : null;
              const barColor =
                pct === null
                  ? "bg-vc-sand/40"
                  : pct >= 100
                    ? "bg-vc-coral"
                    : pct >= 80
                      ? "bg-amber-400"
                      : "bg-vc-sage";
              return (
                <div
                  key={room.id}
                  className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-vc-indigo text-sm">{room.name}</p>
                    <span className="text-xs text-vc-text-secondary">
                      {room.checked_in} in
                      {room.capacity ? ` / ${room.capacity}` : ""}
                    </span>
                  </div>
                  {room.capacity ? (
                    <div className="h-2 rounded-full bg-vc-sand/20 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${Math.min(pct!, 100)}%` }}
                      />
                    </div>
                  ) : (
                    <div className="h-2 rounded-full bg-vc-sand/20" />
                  )}
                  {room.checked_out > 0 && (
                    <p className="text-xs text-vc-text-muted mt-1.5">
                      {room.checked_out} checked out
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <QuickAction
          href="/dashboard/checkin/households"
          label="Manage Households"
          description="Add, edit, or search families"
          icon="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
        />
        <QuickAction
          href="/dashboard/checkin/reports"
          label="Reports"
          description="Attendance and history"
          icon="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
        />
        <QuickAction
          href="/dashboard/settings?tab=checkin"
          label="Settings"
          description="Service times, printers"
          icon="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
        />
        <QuickAction
          href="/dashboard/checkin/import"
          label="Import Families"
          description="Breeze, PCO, or CSV"
          icon="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
        />
      </div>

      {/* Recent sessions */}
      {!loading && stats?.sessions && stats.sessions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-vc-indigo font-display mb-3">
            Today&apos;s Activity
          </h2>
          <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm divide-y divide-vc-border-light">
            {stats.sessions.slice(0, 10).map((session) => (
              <div key={session.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-vc-indigo">{session.child_name}</p>
                  <p className="text-sm text-vc-text-secondary">{session.room_name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm text-vc-text-secondary">
                      {new Date(session.checked_in_at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                    {session.checked_out_at ? (
                      <span className="text-xs text-vc-sage font-medium">Checked out</span>
                    ) : (
                      <span className="text-xs text-vc-coral font-medium">Checked in</span>
                    )}
                  </div>
                  {!session.checked_out_at && (
                    <button
                      type="button"
                      onClick={() => handleAdminCheckout(session.id)}
                      disabled={checkingOutId === session.id}
                      className="text-xs px-3 py-1.5 rounded-lg bg-vc-sage/15 text-vc-sage
                        font-medium hover:bg-vc-sage/25 transition-colors
                        disabled:opacity-50 min-h-[32px]"
                    >
                      {checkingOutId === session.id ? "..." : "Check Out"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  loading,
}: {
  label: string;
  value: number;
  color: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-5">
      <p className="text-sm text-vc-text-secondary mb-1">{label}</p>
      {loading ? (
        <div className="h-8 w-12 rounded bg-vc-sand/20 animate-pulse" />
      ) : (
        <p className={`text-3xl font-bold ${color}`}>{value}</p>
      )}
    </div>
  );
}

function QuickAction({
  href,
  label,
  description,
  icon,
}: {
  href: string;
  label: string;
  description: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-5 hover:border-vc-coral/30
        hover:shadow-sm transition-all group"
    >
      <svg
        className="h-6 w-6 text-vc-coral mb-3 group-hover:scale-110 transition-transform"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      <p className="font-semibold text-vc-indigo">{label}</p>
      <p className="text-sm text-vc-text-secondary mt-0.5">{description}</p>
    </Link>
  );
}
