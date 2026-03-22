"use client";

import { useState } from "react";
import { useAuth } from "@/lib/context/auth-context";

type ReportType = "daily" | "attendance" | "room" | "first_time";

/**
 * /dashboard/checkin/reports — Attendance reports page.
 */
export default function CheckInReportsPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [results, setResults] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const runReport = async () => {
    if (!user || !churchId) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      let url = `/api/admin/checkin/report?church_id=${churchId}&type=${reportType}`;

      if (reportType === "daily" || reportType === "room") {
        url += `&date=${date}`;
      } else {
        url += `&from=${from}&to=${to}`;
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
  };

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

  return (
    <div>
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

      {/* Date inputs */}
      <div className="flex items-end gap-4 mb-6 flex-wrap">
        {(reportType === "daily" || reportType === "room") ? (
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
          </>
        )}

        <button
          type="button"
          onClick={runReport}
          disabled={loading}
          className="h-[42px] px-6 rounded-full bg-vc-coral text-white font-medium
            disabled:opacity-50 transition-colors"
        >
          {loading ? "Loading..." : "Run Report"}
        </button>

        {results && (
          <button
            type="button"
            onClick={downloadCSV}
            className="h-[42px] px-4 rounded-full border border-gray-200 text-gray-600
              font-medium hover:border-gray-300 transition-colors"
          >
            Download CSV
          </button>
        )}
      </div>

      {/* Results */}
      {results && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <pre className="text-sm text-gray-700 whitespace-pre-wrap overflow-auto max-h-[60vh]">
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
