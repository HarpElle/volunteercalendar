"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";
import type { PlatformStats } from "@/lib/types";
import type {
  OrgRiskSignals,
  RecentActivity,
  RecentActivityRow,
} from "@/lib/types/platform";

const RISK_BADGE_LABEL: Record<keyof OrgRiskSignals, string> = {
  dormant_14d: "dormant 14d",
  dormant_30d: "dormant 30d",
  dormant_60d: "dormant 60d",
  free_tier_paid_feature_attempted: "free + paid feature",
  payment_failed: "payment failed",
  subscription_past_due: "past due",
  abandoned_signup: "abandoned signup",
};

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function PlatformOverviewPage() {
  const { user } = useAuth();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [recent, setRecent] = useState<RecentActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const token = await user!.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };

        // Check platform admin status
        const meRes = await fetch("/api/platform/me", { headers });
        const meData = await meRes.json();
        setIsPlatformAdmin(meData.is_platform_admin);
        if (!meData.is_platform_admin) {
          setLoading(false);
          return;
        }

        // Load stats + recent activity (single endpoint)
        const statsRes = await fetch("/api/platform/stats", { headers });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData.stats);
          setRecent(statsData.recent_activity);
        }
      } catch (err) {
        console.error("[Platform Overview] Load failed:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  async function handleRefresh() {
    if (!user || refreshing) return;
    setRefreshing(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/platform/stats", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
      // Also refresh the recent_activity rollup the GET writes alongside
      const refreshed = await fetch("/api/platform/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (refreshed.ok) {
        const data = await refreshed.json();
        setRecent(data.recent_activity);
      }
    } catch (err) {
      console.error("[Platform] Refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-vc-text-secondary">You don&apos;t have access to this page.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">Platform Overview</h1>
          <p className="mt-1 text-vc-text-secondary">
            Bird&apos;s-eye view across all VolunteerCal organizations.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded-lg bg-vc-coral px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-vc-coral/90 disabled:opacity-50"
        >
          {refreshing ? "Refreshing..." : "Refresh Stats"}
        </button>
      </div>

      {!stats ? (
        <div className="rounded-xl border border-dashed border-vc-border-light bg-vc-bg-warm p-12 text-center">
          <p className="text-vc-text-secondary">
            No platform stats computed yet. Click &ldquo;Refresh Stats&rdquo; to compute them, or they&apos;ll be generated on the next nightly cron run.
          </p>
        </div>
      ) : (
        <>
          {/* Top stat cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total Orgs" value={stats.total_orgs} />
            <StatCard label="Total Volunteers" value={stats.total_volunteers} />
            <StatCard
              label="Open Platform Feedback"
              value={stats.open_platform_feedback}
              accent={stats.open_platform_feedback > 0}
            />
            <StatCard label="New Orgs (30d)" value={stats.new_orgs_30d} />
          </div>

          {/* Second row */}
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total People" value={stats.total_people} />
            <StatCard label="New People (30d)" value={stats.new_people_30d} />
            <StatCard label="Total Assignments" value={stats.total_assignments} />
            <StatCard label="Total Feedback" value={stats.total_feedback} />
          </div>

          {/* Growth */}
          <div className="mt-6 rounded-xl border border-vc-border-light bg-white p-5">
            <h2 className="mb-3 font-semibold text-vc-indigo">Org Growth</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-vc-text-muted">Last 30 days</p>
                <p className="text-2xl font-bold text-vc-sage">+{stats.new_orgs_30d}</p>
              </div>
              <div>
                <p className="text-xs text-vc-text-muted">Last 60 days</p>
                <p className="text-2xl font-bold text-vc-sage">+{stats.new_orgs_60d}</p>
              </div>
              <div>
                <p className="text-xs text-vc-text-muted">Last 90 days</p>
                <p className="text-2xl font-bold text-vc-sage">+{stats.new_orgs_90d}</p>
              </div>
            </div>
          </div>

          {/* People Growth */}
          <div className="mt-4 rounded-xl border border-vc-border-light bg-white p-5">
            <h2 className="mb-3 font-semibold text-vc-indigo">People Growth</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-vc-text-muted">Last 30 days</p>
                <p className="text-2xl font-bold text-vc-sage">+{stats.new_people_30d}</p>
              </div>
              <div>
                <p className="text-xs text-vc-text-muted">Last 60 days</p>
                <p className="text-2xl font-bold text-vc-sage">+{stats.new_people_60d}</p>
              </div>
              <div>
                <p className="text-xs text-vc-text-muted">Last 90 days</p>
                <p className="text-2xl font-bold text-vc-sage">+{stats.new_people_90d}</p>
              </div>
            </div>
          </div>

          {/* Tier Distribution */}
          <div className="mt-4 rounded-xl border border-vc-border-light bg-white p-5">
            <h2 className="mb-3 font-semibold text-vc-indigo">Tier Distribution</h2>
            <div className="space-y-2">
              {(["free", "starter", "growth", "pro", "enterprise"] as const).map((tier) => {
                const count = stats.tier_distribution[tier] || 0;
                const pct = stats.total_orgs > 0 ? (count / stats.total_orgs) * 100 : 0;
                return (
                  <div key={tier} className="flex items-center gap-3">
                    <span className="w-20 text-sm font-medium capitalize text-vc-text-secondary">
                      {tier}
                    </span>
                    <div className="flex-1 h-5 rounded-full bg-vc-border overflow-hidden">
                      <div
                        className="h-full rounded-full bg-vc-coral transition-all"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-sm font-semibold text-vc-indigo">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Feature Adoption */}
          <div className="mt-4 rounded-xl border border-vc-border-light bg-white p-5">
            <h2 className="mb-3 font-semibold text-vc-indigo">Feature Adoption</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-lg border border-vc-border-light p-3">
                <p className="text-2xl font-bold text-vc-indigo">
                  {stats.feature_adoption.worship_enabled}
                </p>
                <p className="text-xs text-vc-text-muted">Worship</p>
              </div>
              <div className="rounded-lg border border-vc-border-light p-3">
                <p className="text-2xl font-bold text-vc-indigo">
                  {stats.feature_adoption.checkin_enabled}
                </p>
                <p className="text-xs text-vc-text-muted">Check-In</p>
              </div>
              <div className="rounded-lg border border-vc-border-light p-3">
                <p className="text-2xl font-bold text-vc-indigo">
                  {stats.feature_adoption.rooms_enabled}
                </p>
                <p className="text-xs text-vc-text-muted">Rooms</p>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          {recent && (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <ActivityCard
                title="Most active orgs (last 7 days)"
                rows={recent.most_active}
                emptyText="No recent activity yet."
              />
              <ActivityCard
                title="Dormant orgs (>14 days)"
                rows={recent.dormant}
                emptyText="No dormant orgs."
                tone="warning"
              />
            </div>
          )}

          {/* At-Risk Callouts */}
          {recent && recent.at_risk.length > 0 && (
            <div className="mt-4 rounded-xl border border-vc-coral/30 bg-vc-coral/5 p-5">
              <h2 className="mb-3 font-semibold text-vc-coral">At-risk orgs</h2>
              <div className="space-y-2">
                {recent.at_risk.map((row) => (
                  <Link
                    key={row.id}
                    href={`/dashboard/platform/orgs/${row.id}`}
                    className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm transition-colors hover:bg-vc-bg-warm"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-vc-indigo">{row.name}</p>
                      <p className="text-xs text-vc-text-muted">
                        {row.tier} &middot; {row.signal}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {row.risk_badges.map((b) => (
                        <span
                          key={b}
                          className="rounded-full bg-vc-coral/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-vc-coral"
                        >
                          {RISK_BADGE_LABEL[b] ?? b}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Quick Links */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Link
              href="/dashboard/platform/feedback"
              className="rounded-xl border border-vc-border-light bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <h3 className="font-semibold text-vc-indigo">Platform Feedback</h3>
              <p className="mt-1 text-sm text-vc-text-secondary">
                Triage bugs and feature requests from all orgs.
              </p>
              {stats.open_platform_feedback > 0 && (
                <p className="mt-2 text-sm font-semibold text-vc-coral">
                  {stats.open_platform_feedback} open items
                </p>
              )}
            </Link>
            <Link
              href="/dashboard/platform/orgs"
              className="rounded-xl border border-vc-border-light bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <h3 className="font-semibold text-vc-indigo">Organizations</h3>
              <p className="mt-1 text-sm text-vc-text-secondary">
                Browse all orgs, manage tiers, view usage.
              </p>
            </Link>
          </div>

          {/* Computed timestamp */}
          {stats.computed_at && (
            <p className="mt-4 text-xs text-vc-text-muted text-right">
              Stats computed {new Date(stats.computed_at).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-vc-border-light bg-white p-4">
      <p className="text-xs text-vc-text-muted">{label}</p>
      <p
        className={`text-2xl font-bold ${accent ? "text-vc-coral" : "text-vc-indigo"}`}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function ActivityCard({
  title,
  rows,
  emptyText,
  tone,
}: {
  title: string;
  rows: RecentActivityRow[];
  emptyText: string;
  tone?: "warning";
}) {
  const titleColor = tone === "warning" ? "text-vc-warning" : "text-vc-indigo";
  return (
    <div className="rounded-xl border border-vc-border-light bg-white p-5">
      <h2 className={`mb-3 font-semibold ${titleColor}`}>{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-vc-text-muted">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-vc-border-light">
          {rows.map((row) => (
            <li key={row.id} className="py-2">
              <Link
                href={`/dashboard/platform/orgs/${row.id}`}
                className="block rounded-lg px-2 py-1 transition-colors hover:bg-vc-bg-warm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium text-vc-indigo truncate">
                    {row.name}
                  </p>
                  <span className="shrink-0 text-xs text-vc-text-muted">
                    {formatRelative(row.last_active_at)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-vc-text-secondary">
                  <span className="capitalize">{row.tier}</span>
                  {row.signal ? <> &middot; {row.signal}</> : null}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
