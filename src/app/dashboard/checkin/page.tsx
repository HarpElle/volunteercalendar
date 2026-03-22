"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import Link from "next/link";

interface DailyStats {
  date: string;
  sessions: {
    id: string;
    child_name: string;
    room_name: string;
    checked_in_at: string;
    checked_out_at: string | null;
  }[];
}

/**
 * /dashboard/checkin — Check-In overview/landing page.
 * Shows today's check-in activity and quick action links.
 */
export default function CheckInDashboardPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !churchId) return;

    const fetchStats = async () => {
      try {
        const token = await user.getIdToken();
        const today = new Date().toISOString().split("T")[0];
        const res = await fetch(
          `/api/admin/checkin/report?church_id=${churchId}&type=daily&date=${today}`,
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
    };

    fetchStats();
  }, [user, churchId]);

  const checkedIn = stats?.sessions?.filter((s) => !s.checked_out_at).length ?? 0;
  const checkedOut = stats?.sessions?.filter((s) => s.checked_out_at).length ?? 0;
  const total = stats?.sessions?.length ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-vc-indigo font-display mb-6">
        Children&apos;s Check-In
      </h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Checked In" value={checkedIn} color="text-vc-coral" loading={loading} />
        <StatCard label="Checked Out" value={checkedOut} color="text-vc-sage" loading={loading} />
        <StatCard label="Total Today" value={total} color="text-vc-indigo" loading={loading} />
      </div>

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
          href="/dashboard/checkin/settings"
          label="Settings"
          description="Service times, printers"
          icon="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
        />
        <QuickAction
          href="/dashboard/checkin/import"
          label="Import"
          description="Breeze CSV import"
          icon="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
        />
      </div>

      {/* Recent sessions */}
      {!loading && stats?.sessions && stats.sessions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-vc-indigo font-display mb-3">
            Today&apos;s Activity
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {stats.sessions.slice(0, 10).map((session) => (
              <div key={session.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-vc-indigo">{session.child_name}</p>
                  <p className="text-sm text-gray-500">{session.room_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">
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
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      {loading ? (
        <div className="h-8 w-12 rounded bg-gray-100 animate-pulse" />
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
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-vc-coral/30
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
      <p className="text-sm text-gray-500 mt-0.5">{description}</p>
    </Link>
  );
}
