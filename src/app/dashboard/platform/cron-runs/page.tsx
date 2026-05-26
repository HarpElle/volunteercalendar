"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";

interface CronRun {
  id: string;
  cron_name: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "ok" | "failed";
  duration_ms: number | null;
  processed?: number | null;
  failed?: number | null;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function statusPillClass(status: CronRun["status"]): string {
  switch (status) {
    case "ok":
      return "bg-vc-sage/15 text-vc-sage";
    case "failed":
      return "bg-red-100 text-red-700";
    case "running":
      return "bg-amber-100 text-amber-800";
  }
}

export default function CronRunsPage() {
  const { user } = useAuth();
  const [runs, setRuns] = useState<CronRun[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await user!.getIdToken();
        const res = await fetch(`/api/platform/cron-runs?days=${days}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load (${res.status})`);
        }
        const data = await res.json();
        if (!cancelled) setRuns(data.runs as CronRun[]);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, days]);

  const grouped = runs ? groupByCronName(runs) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <Link
            href="/dashboard/platform"
            className="text-sm text-vc-indigo/60 hover:text-vc-indigo"
          >
            ← Platform admin
          </Link>
          <h1 className="font-display mt-2 text-3xl font-semibold text-vc-indigo">
            Cron runs
          </h1>
          <p className="mt-1 text-sm text-vc-indigo/70">
            Every scheduled job writes a row here. Use this page to spot missed
            runs, slow runs, and failure spikes without trawling Vercel logs.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-vc-indigo/80">
          Lookback
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="rounded border border-vc-indigo/20 bg-white px-2 py-1"
          >
            <option value={1}>1 day</option>
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>
      </header>

      {loading && <Spinner />}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}

      {!loading && runs && runs.length === 0 && (
        <div className="rounded border border-vc-indigo/10 bg-vc-bg-warm p-6 text-vc-indigo/70">
          No cron runs in the last {days} {days === 1 ? "day" : "days"}. Once
          a scheduled job runs after this PR ships, rows will appear here.
        </div>
      )}

      {!loading && grouped && grouped.length > 0 && (
        <div className="space-y-4">
          {grouped.map((group) => (
            <section
              key={group.name}
              className="overflow-hidden rounded-lg border border-vc-indigo/10 bg-white"
            >
              <header className="flex items-center justify-between bg-vc-bg-warm px-4 py-3">
                <h2 className="font-display text-lg font-semibold text-vc-indigo">
                  {group.name}
                </h2>
                <div className="text-xs text-vc-indigo/60">
                  {group.runs.length} run{group.runs.length === 1 ? "" : "s"}
                  {" · "}
                  {group.runs.filter((r) => r.status === "failed").length} failed
                </div>
              </header>
              <table className="w-full text-sm">
                <thead className="bg-vc-bg text-left text-xs uppercase tracking-wide text-vc-indigo/60">
                  <tr>
                    <th className="px-4 py-2">Started</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Duration</th>
                    <th className="px-4 py-2">Processed</th>
                    <th className="px-4 py-2">Failed</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {group.runs.map((run) => {
                    const isExpanded = expanded.has(run.id);
                    const hasDetail =
                      !!run.error_message ||
                      (run.metadata && Object.keys(run.metadata).length > 0);
                    return (
                      <>
                        <tr
                          key={run.id}
                          className="border-t border-vc-indigo/5"
                        >
                          <td className="px-4 py-2 text-vc-indigo/90">
                            {formatRelative(run.started_at)}
                            <div className="text-xs text-vc-indigo/50">
                              {new Date(run.started_at).toLocaleString()}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusPillClass(run.status)}`}
                            >
                              {run.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-vc-indigo/90">
                            {formatDuration(run.duration_ms)}
                          </td>
                          <td className="px-4 py-2 text-vc-indigo/90">
                            {run.processed ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-vc-indigo/90">
                            {run.failed ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {hasDetail && (
                              <button
                                onClick={() =>
                                  setExpanded((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(run.id)) next.delete(run.id);
                                    else next.add(run.id);
                                    return next;
                                  })
                                }
                                className="text-xs text-vc-coral hover:underline"
                              >
                                {isExpanded ? "Hide" : "Detail"}
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExpanded && hasDetail && (
                          <tr
                            key={`${run.id}-detail`}
                            className="border-t border-vc-indigo/5 bg-vc-bg-warm/50"
                          >
                            <td colSpan={6} className="px-4 py-3">
                              {run.error_message && (
                                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-900">
                                  {run.error_message}
                                </pre>
                              )}
                              {run.metadata && (
                                <pre className="mt-2 overflow-x-auto rounded bg-white p-2 text-xs text-vc-indigo/80">
                                  {JSON.stringify(run.metadata, null, 2)}
                                </pre>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByCronName(runs: CronRun[]): { name: string; runs: CronRun[] }[] {
  const map = new Map<string, CronRun[]>();
  for (const run of runs) {
    const list = map.get(run.cron_name) ?? [];
    list.push(run);
    map.set(run.cron_name, list);
  }
  return Array.from(map.entries())
    .map(([name, runs]) => ({ name, runs }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
