"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AggregatedSong {
  song_id: string;
  song_title: string;
  ccli_number: string | null;
  count: number;
  last_used: string;
  services: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDefaultDateRange(): { from: string; to: string } {
  const today = new Date();
  const threeMonthsAgo = new Date(today);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  return {
    from: threeMonthsAgo.toISOString().split("T")[0],
    to: today.toISOString().split("T")[0],
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WorshipReportsPage() {
  const { user, activeMembership, profile } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const defaults = getDefaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [songs, setSongs] = useState<AggregatedSong[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // ---- Fetch report ----

  useEffect(() => {
    if (!churchId || !user) return;

    let cancelled = false;

    async function fetchReport() {
      setLoading(true);
      setError(null);

      try {
        const token = await user!.getIdToken();
        const params = new URLSearchParams({
          church_id: churchId!,
          from: dateFrom,
          to: dateTo,
        });

        const res = await fetch(`/api/reports/song-usage?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          throw new Error(`Failed to load report (${res.status})`);
        }

        const data = await res.json();
        if (!cancelled) {
          setSongs(data.aggregated ?? []);
          setTotalRecords(data.total_records ?? 0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchReport();
    return () => {
      cancelled = true;
    };
  }, [churchId, user, dateFrom, dateTo]);

  // ---- Export CSV ----

  async function handleExportCSV() {
    if (!churchId || !user) return;
    setExporting(true);

    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({
        church_id: churchId,
        from: dateFrom,
        to: dateTo,
        format: "csv",
      });

      const res = await fetch(`/api/reports/song-usage/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `song-usage_${dateFrom}_to_${dateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to export CSV");
    } finally {
      setExporting(false);
    }
  }

  // ---- Totals ----

  const totalUses = useMemo(
    () => songs.reduce((sum, s) => sum + s.count, 0),
    [songs],
  );

  return (
    <div className="min-h-screen bg-vc-bg px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">Song Usage Reports</h1>
          <p className="mt-1 text-vc-text-secondary">
            Track song usage for CCLI compliance and worship planning.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportCSV}
          disabled={exporting || songs.length === 0}
        >
          {exporting ? <Spinner size="sm" /> : "Export CSV"}
        </Button>
      </div>

      {/* Date range */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div>
          <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
            From
          </label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
            To
          </label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      {/* Summary cards */}
      {!loading && !error && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-vc-border-light bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-vc-text-muted">
              Unique Songs
            </p>
            <p className="mt-1 font-display text-2xl text-vc-indigo">{songs.length}</p>
          </div>
          <div className="rounded-xl border border-vc-border-light bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-vc-text-muted">
              Total Uses
            </p>
            <p className="mt-1 font-display text-2xl text-vc-indigo">{totalUses}</p>
          </div>
          <div className="rounded-xl border border-vc-border-light bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-vc-text-muted">
              Usage Records
            </p>
            <p className="mt-1 font-display text-2xl text-vc-indigo">{totalRecords}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-lg border border-vc-danger/20 bg-vc-danger/5 p-4 text-center text-vc-danger">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && songs.length === 0 && (
        <div className="rounded-xl bg-vc-bg-warm p-12 text-center">
          <h2 className="font-display text-xl text-vc-indigo">No usage data</h2>
          <p className="mt-2 text-vc-text-secondary">
            Song usage is tracked automatically when service plans are published.
            Adjust the date range or publish a plan to see data here.
          </p>
        </div>
      )}

      {/* Song usage table */}
      {!loading && !error && songs.length > 0 && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-vc-border text-xs font-medium uppercase tracking-wider text-vc-text-secondary">
                <th className="px-4 py-3 sm:px-6">Song</th>
                <th className="px-4 py-3 sm:px-6">CCLI #</th>
                <th className="px-4 py-3 sm:px-6">Times Used</th>
                <th className="hidden px-4 py-3 md:table-cell md:px-6">Last Used</th>
                <th className="hidden px-4 py-3 lg:table-cell lg:px-6">Services</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vc-border/50">
              {songs.map((song) => (
                <tr
                  key={song.song_id}
                  className="transition-colors hover:bg-vc-bg-warm/50"
                >
                  <td className="px-4 py-4 font-medium text-vc-text sm:px-6">
                    {song.song_title}
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    {song.ccli_number ? (
                      <span className="font-mono text-xs text-vc-text-secondary">
                        {song.ccli_number}
                      </span>
                    ) : (
                      <span className="text-vc-text-muted">--</span>
                    )}
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <Badge variant="accent">{song.count}</Badge>
                  </td>
                  <td className="hidden px-4 py-4 text-vc-text-secondary md:table-cell md:px-6">
                    {formatDate(song.last_used)}
                  </td>
                  <td className="hidden px-4 py-4 lg:table-cell lg:px-6">
                    <div className="flex flex-wrap gap-1">
                      {song.services.map((s) => (
                        <Badge key={s}>{s}</Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
