"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";
import type { PlatformStats } from "@/lib/types";

export default function PlatformOverviewPage() {
  const { user } = useAuth();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState<PlatformStats | null>(null);
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

        // Load stats
        const statsRes = await fetch("/api/platform/stats", { headers });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData.stats);
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
