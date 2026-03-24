"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

type ReportType = "daily" | "attendance" | "room" | "first_time";

// --- API response shapes ---

interface DailySession {
  id: string;
  child_name: string;
  room_name: string;
  checked_in_at: string;
  checked_out_at: string | null;
  security_code: string;
  alert_snapshot: string | null;
}

interface DailyReport {
  date: string;
  sessions: DailySession[];
}

interface AttendanceReport {
  from: string;
  to: string;
  total: number;
  by_date: Record<string, number>;
}

interface RoomEntry {
  name: string;
  count: number;
  checked_out: number;
}

interface RoomReport {
  date: string;
  rooms: Record<string, RoomEntry>;
}

interface FirstTimeHousehold {
  id: string;
  primary_guardian_name: string;
  created_at: string;
  imported_from: string | null;
}

interface FirstTimeReport {
  from: string;
  to: string;
  households: FirstTimeHousehold[];
}

type ReportData = DailyReport | AttendanceReport | RoomReport | FirstTimeReport;

const REPORT_LABELS: Record<ReportType, string> = {
  daily: "Daily Check-In Log",
  attendance: "Attendance Trends",
  room: "Room Utilization",
  first_time: "First-Time Visitors",
};

// Brand colors
const VC_CORAL = "#E07A5F";
const VC_SAGE = "#7FA67D";
const VC_INDIGO = "#2D3047";

/**
 * /dashboard/checkin/reports — Visual attendance reports with charts and tables.
 */
export default function CheckInReportsPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [results, setResults] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const isRangeReport = reportType === "attendance" || reportType === "first_time";

  const runReport = useCallback(async (overrideFrom?: string, overrideTo?: string) => {
    if (!user || !churchId) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      let url = `/api/admin/checkin/report?church_id=${churchId}&type=${reportType}`;

      if (reportType === "daily" || reportType === "room") {
        url += `&date=${date}`;
      } else {
        url += `&from=${overrideFrom || from}&to=${overrideTo || to}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setResults(await res.json());
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, churchId, reportType, date, from, to]);

  const downloadCSV = async () => {
    if (!user || !churchId) return;
    const token = await user.getIdToken();
    let url = `/api/admin/checkin/report?church_id=${churchId}&type=${reportType}&format=csv`;

    if (reportType === "daily" || reportType === "room") {
      url += `&date=${date}`;
    } else {
      url += `&from=${from}&to=${to}`;
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;

    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `checkin-${reportType}-${date || from}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const summary = buildShareSummary();
    if (navigator.share) {
      try {
        await navigator.share({ title: `Check-In ${REPORT_LABELS[reportType]}`, text: summary });
        return;
      } catch {
        // Fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(summary);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // silent
    }
  };

  const buildShareSummary = (): string => {
    if (!results) return "";
    switch (reportType) {
      case "daily": {
        const r = results as DailyReport;
        const active = r.sessions.filter((s) => !s.checked_out_at).length;
        return `Check-In Daily Log — ${formatDateLabel(r.date)}: ${r.sessions.length} children checked in, ${active} still active.`;
      }
      case "attendance": {
        const r = results as AttendanceReport;
        const days = Object.keys(r.by_date).length;
        const avg = days > 0 ? Math.round(r.total / days) : 0;
        return `Check-In Attendance — ${formatDateLabel(r.from)} to ${formatDateLabel(r.to)}: ${r.total} total check-ins, ${avg} avg/day over ${days} days.`;
      }
      case "room": {
        const r = results as RoomReport;
        const rooms = Object.values(r.rooms);
        const total = rooms.reduce((s, rm) => s + rm.count, 0);
        return `Check-In Room Utilization — ${formatDateLabel(r.date)}: ${total} check-ins across ${rooms.length} rooms.`;
      }
      case "first_time": {
        const r = results as FirstTimeReport;
        return `First-Time Visitors — ${formatDateLabel(r.from)} to ${formatDateLabel(r.to)}: ${r.households.length} new families registered.`;
      }
    }
  };

  const applyPreset = (days: number | "year") => {
    const end = new Date();
    const start = new Date();
    if (days === "year") {
      start.setMonth(0, 1);
    } else {
      start.setDate(start.getDate() - days);
    }
    const f = start.toISOString().split("T")[0];
    const t = end.toISOString().split("T")[0];
    setFrom(f);
    setTo(t);
    // Auto-run with the new dates
    setTimeout(() => runReport(f, t), 0);
  };

  return (
    <div>
      {/* Print header — only visible when printing */}
      <div className="hidden print:block print:mb-6">
        <h1 className="text-2xl font-bold text-vc-indigo">
          {REPORT_LABELS[reportType]}
        </h1>
        <p className="text-sm text-gray-500">
          {isRangeReport
            ? `${formatDateLabel(from)} — ${formatDateLabel(to)}`
            : formatDateLabel(date)}
        </p>
      </div>

      {/* Controls — hidden when printing */}
      <div className="print:hidden">
        <h1 className="text-2xl font-bold text-vc-indigo font-display mb-6">
          Check-In Reports
        </h1>

        {/* Report type tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(
            [
              { key: "daily", label: "Daily" },
              { key: "attendance", label: "Attendance" },
              { key: "room", label: "By Room" },
              { key: "first_time", label: "First-Time Visitors" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setReportType(tab.key);
                setResults(null);
              }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                reportType === tab.key
                  ? "bg-vc-coral text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Date inputs + presets */}
        <div className="flex items-end gap-4 mb-6 flex-wrap">
          {!isRangeReport ? (
            <div>
              <label className="block text-sm text-gray-500 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-4 py-2 rounded-xl border border-gray-200 focus:border-vc-coral
                  focus:ring-1 focus:ring-vc-coral/30 outline-none"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm text-gray-500 mb-1">From</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="px-4 py-2 rounded-xl border border-gray-200 focus:border-vc-coral
                    focus:ring-1 focus:ring-vc-coral/30 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">To</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="px-4 py-2 rounded-xl border border-gray-200 focus:border-vc-coral
                    focus:ring-1 focus:ring-vc-coral/30 outline-none"
                />
              </div>
              {/* Quick presets */}
              <div className="flex gap-1.5">
                {[
                  { label: "7 days", value: 7 },
                  { label: "30 days", value: 30 },
                  { label: "90 days", value: 90 },
                  { label: "This year", value: "year" as const },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p.value)}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200
                      text-gray-500 hover:border-vc-coral hover:text-vc-coral transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => runReport()}
            disabled={loading}
            className="h-[42px] px-6 rounded-full bg-vc-coral text-white font-medium
              disabled:opacity-50 transition-colors"
          >
            {loading ? "Loading..." : "Run Report"}
          </button>

          {results && (
            <>
              <button
                type="button"
                onClick={downloadCSV}
                className="h-[42px] px-4 rounded-full border border-gray-200 text-gray-600
                  font-medium hover:border-gray-300 transition-colors inline-flex items-center gap-1.5"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                CSV
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="h-[42px] px-4 rounded-full border border-gray-200 text-gray-600
                  font-medium hover:border-gray-300 transition-colors inline-flex items-center gap-1.5"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m0 0a48.159 48.159 0 0 1 12.5 0m-12.5 0v-3.09A2.25 2.25 0 0 1 7.5 3.75h9a2.25 2.25 0 0 1 2.25 2.25v3.09" />
                </svg>
                Print
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="h-[42px] px-4 rounded-full border border-gray-200 text-gray-600
                  font-medium hover:border-gray-300 transition-colors inline-flex items-center gap-1.5"
              >
                {shareCopied ? (
                  <>
                    <svg className="h-4 w-4 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.935-2.186 2.25 2.25 0 0 0-3.935 2.186Z" />
                    </svg>
                    Share
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Results — visible in both screen and print */}
      {results && (
        <div className="print:mt-0">
          {reportType === "daily" && <DailyReportView data={results as DailyReport} />}
          {reportType === "attendance" && <AttendanceReportView data={results as AttendanceReport} />}
          {reportType === "room" && <RoomReportView data={results as RoomReport} />}
          {reportType === "first_time" && <FirstTimeReportView data={results as FirstTimeReport} />}
        </div>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          /* Hide sidebar, header, nav, and report controls */
          nav, header, aside,
          [data-sidebar], [data-topbar], [data-mobile-nav] {
            display: none !important;
          }
          /* Let the main content fill the page */
          main, [data-main-content] {
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Report Views ────────────────────────────────────────────────────────────

function DailyReportView({ data }: { data: DailyReport }) {
  const active = data.sessions.filter((s) => !s.checked_out_at).length;
  const checkedOut = data.sessions.filter((s) => s.checked_out_at).length;

  return (
    <div>
      {/* Summary */}
      <div className="flex gap-4 mb-5 flex-wrap">
        <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm px-5 py-3">
          <p className="text-xs text-vc-text-secondary">Total</p>
          <p className="text-2xl font-bold text-vc-indigo">{data.sessions.length}</p>
        </div>
        <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm px-5 py-3">
          <p className="text-xs text-vc-text-secondary">Active</p>
          <p className="text-2xl font-bold text-vc-coral">{active}</p>
        </div>
        <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm px-5 py-3">
          <p className="text-xs text-vc-text-secondary">Checked Out</p>
          <p className="text-2xl font-bold text-vc-sage">{checkedOut}</p>
        </div>
      </div>

      {/* Table */}
      {data.sessions.length === 0 ? (
        <p className="text-sm text-vc-text-muted py-8 text-center">
          No check-ins found for this date.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-vc-border-light">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-vc-bg-warm border-b border-vc-border-light text-left">
                <th className="px-4 py-3 font-semibold text-vc-text-secondary">Child</th>
                <th className="px-4 py-3 font-semibold text-vc-text-secondary">Room</th>
                <th className="px-4 py-3 font-semibold text-vc-text-secondary">In</th>
                <th className="px-4 py-3 font-semibold text-vc-text-secondary">Out</th>
                <th className="px-4 py-3 font-semibold text-vc-text-secondary">Status</th>
                <th className="px-4 py-3 font-semibold text-vc-text-secondary">Code</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vc-border-light">
              {data.sessions.map((s) => (
                <tr key={s.id} className="hover:bg-vc-bg-warm/50">
                  <td className="px-4 py-3 font-medium text-vc-indigo">
                    <span className="inline-flex items-center gap-1.5">
                      {s.child_name}
                      {s.alert_snapshot && (
                        <span title={s.alert_snapshot} className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100">
                          <svg className="w-3 h-3 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                          </svg>
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-vc-text-secondary">{s.room_name}</td>
                  <td className="px-4 py-3 text-vc-text-secondary">{formatTime(s.checked_in_at)}</td>
                  <td className="px-4 py-3 text-vc-text-secondary">
                    {s.checked_out_at ? formatTime(s.checked_out_at) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {s.checked_out_at ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-vc-sage/15 text-vc-sage">
                        Checked out
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-vc-coral/15 text-vc-coral">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-vc-text-muted">{s.security_code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AttendanceReportView({ data }: { data: AttendanceReport }) {
  const entries = Object.entries(data.by_date)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      date,
      label: formatShortDate(date),
      count,
    }));

  const days = entries.length;
  const avg = days > 0 ? Math.round(data.total / days) : 0;
  const peak = entries.reduce((max, e) => Math.max(max, e.count), 0);

  return (
    <div>
      {/* Summary cards */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm px-5 py-3">
          <p className="text-xs text-vc-text-secondary">Total Check-Ins</p>
          <p className="text-2xl font-bold text-vc-indigo">{data.total}</p>
        </div>
        <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm px-5 py-3">
          <p className="text-xs text-vc-text-secondary">Days with Activity</p>
          <p className="text-2xl font-bold text-vc-indigo">{days}</p>
        </div>
        <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm px-5 py-3">
          <p className="text-xs text-vc-text-secondary">Average / Day</p>
          <p className="text-2xl font-bold text-vc-coral">{avg}</p>
        </div>
        <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm px-5 py-3">
          <p className="text-xs text-vc-text-secondary">Peak Day</p>
          <p className="text-2xl font-bold text-vc-sage">{peak}</p>
        </div>
      </div>

      {/* Chart */}
      {entries.length === 0 ? (
        <p className="text-sm text-vc-text-muted py-8 text-center">
          No check-in data found for this date range.
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-vc-border-light p-5">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={entries} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E4DE" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#8E8A82" }}
                tickLine={false}
                axisLine={{ stroke: "#E8E4DE" }}
                interval={entries.length > 14 ? Math.floor(entries.length / 10) : 0}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#8E8A82" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #E8E4DE",
                  fontSize: 13,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
                labelFormatter={(label) => `${label}`}
                formatter={(value) => [String(value), "Check-ins"]}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {entries.map((entry) => (
                  <Cell
                    key={entry.date}
                    fill={entry.count === peak ? VC_CORAL : `${VC_CORAL}99`}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function RoomReportView({ data }: { data: RoomReport }) {
  const rooms = Object.entries(data.rooms).map(([id, r]) => ({
    id,
    name: r.name,
    stillIn: r.count - r.checked_out,
    checkedOut: r.checked_out,
    total: r.count,
  }));

  const totalAll = rooms.reduce((s, r) => s + r.total, 0);

  return (
    <div>
      {/* Summary */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm px-5 py-3">
          <p className="text-xs text-vc-text-secondary">Total Check-Ins</p>
          <p className="text-2xl font-bold text-vc-indigo">{totalAll}</p>
        </div>
        <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm px-5 py-3">
          <p className="text-xs text-vc-text-secondary">Rooms Used</p>
          <p className="text-2xl font-bold text-vc-indigo">{rooms.length}</p>
        </div>
      </div>

      {rooms.length === 0 ? (
        <p className="text-sm text-vc-text-muted py-8 text-center">
          No check-in data found for this date.
        </p>
      ) : (
        <>
          {/* Horizontal stacked bar chart */}
          <div className="bg-white rounded-xl border border-vc-border-light p-5 mb-5">
            <ResponsiveContainer width="100%" height={Math.max(180, rooms.length * 48 + 40)}>
              <BarChart
                data={rooms}
                layout="vertical"
                margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E4DE" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "#8E8A82" }}
                  tickLine={false}
                  axisLine={{ stroke: "#E8E4DE" }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12, fill: VC_INDIGO }}
                  tickLine={false}
                  axisLine={false}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #E8E4DE",
                    fontSize: 13,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  }}
                />
                <Bar dataKey="stillIn" name="Still In" stackId="a" fill={VC_CORAL} radius={[0, 0, 0, 0]} />
                <Bar dataKey="checkedOut" name="Checked Out" stackId="a" fill={VC_SAGE} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detail table */}
          <div className="overflow-x-auto rounded-xl border border-vc-border-light">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-vc-bg-warm border-b border-vc-border-light text-left">
                  <th className="px-4 py-3 font-semibold text-vc-text-secondary">Room</th>
                  <th className="px-4 py-3 font-semibold text-vc-text-secondary text-right">Total</th>
                  <th className="px-4 py-3 font-semibold text-vc-text-secondary text-right">Still In</th>
                  <th className="px-4 py-3 font-semibold text-vc-text-secondary text-right">Checked Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vc-border-light">
                {rooms.map((r) => (
                  <tr key={r.id} className="hover:bg-vc-bg-warm/50">
                    <td className="px-4 py-3 font-medium text-vc-indigo">{r.name}</td>
                    <td className="px-4 py-3 text-right text-vc-indigo font-semibold">{r.total}</td>
                    <td className="px-4 py-3 text-right text-vc-coral">{r.stillIn}</td>
                    <td className="px-4 py-3 text-right text-vc-sage">{r.checkedOut}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function FirstTimeReportView({ data }: { data: FirstTimeReport }) {
  const sorted = [...data.households].sort(
    (a, b) => b.created_at.localeCompare(a.created_at),
  );

  const sourceLabel = (src: string | null) => {
    if (!src || src === "manual") return "Manual Registration";
    if (src === "kiosk") return "Kiosk Registration";
    if (src.includes("breeze")) return "Breeze Import";
    if (src.includes("pco")) return "PCO Import";
    if (src.includes("csv")) return "CSV Import";
    return src;
  };

  const sourceBadgeColor = (src: string | null) => {
    if (!src || src === "manual" || src === "kiosk") return "bg-vc-sand/30 text-vc-indigo";
    return "bg-vc-sage/15 text-vc-sage";
  };

  return (
    <div>
      {/* Summary */}
      <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm px-5 py-3 mb-5 inline-block">
        <p className="text-xs text-vc-text-secondary">New Families</p>
        <p className="text-2xl font-bold text-vc-indigo">{data.households.length}</p>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-vc-text-muted py-8 text-center">
          No new families registered in this date range.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map((h) => (
            <div
              key={h.id || h.created_at}
              className="rounded-xl border border-vc-border-light bg-white p-4 hover:border-vc-coral/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-semibold text-vc-indigo">{h.primary_guardian_name}</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${sourceBadgeColor(h.imported_from)}`}>
                  {sourceLabel(h.imported_from)}
                </span>
              </div>
              <p className="text-xs text-vc-text-muted">
                Registered {formatDateLabel(h.created_at.split("T")[0])}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatDateLabel(isoDate: string): string {
  if (!isoDate) return "";
  const d = new Date(isoDate.split("T")[0] + "T12:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
