"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import type { SubscriptionTier } from "@/lib/types";
import type {
  OrgListRow,
  OrgRiskSignals,
  OrgStatus,
} from "@/lib/types/platform";

const TIER_BADGE: Record<
  SubscriptionTier,
  { variant: "default" | "warning" | "accent" | "success" | "danger" }
> = {
  free: { variant: "default" },
  starter: { variant: "accent" },
  growth: { variant: "warning" },
  pro: { variant: "success" },
  enterprise: { variant: "danger" },
};

const STATUS_LABEL: Record<OrgStatus, { text: string; tone: "ok" | "warn" | "bad" }> = {
  active: { text: "active", tone: "ok" },
  dormant_14d: { text: "dormant 14d", tone: "warn" },
  dormant_30d: { text: "dormant 30d", tone: "warn" },
  abandoned_signup: { text: "abandoned", tone: "warn" },
  at_risk: { text: "at risk", tone: "bad" },
};

const RISK_LABEL: Record<keyof OrgRiskSignals, string> = {
  dormant_14d: "dormant 14d",
  dormant_30d: "dormant 30d",
  dormant_60d: "dormant 60d",
  free_tier_paid_feature_attempted: "free + paid feature",
  payment_failed: "payment failed",
  subscription_past_due: "past due",
  abandoned_signup: "abandoned signup",
};

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
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function PlatformOrgsPage() {
  const { user } = useAuth();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<OrgListRow[]>([]);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [checkinFilter, setCheckinFilter] = useState("");
  const [sort, setSort] = useState("created_at");

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const token = await user!.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };

        const meRes = await fetch("/api/platform/me", { headers });
        const meData = await meRes.json();
        setIsPlatformAdmin(meData.is_platform_admin);
        if (!meData.is_platform_admin) {
          setLoading(false);
          return;
        }

        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (tierFilter) params.set("tier", tierFilter);
        if (statusFilter) params.set("status", statusFilter);
        if (checkinFilter) params.set("has_checkin", checkinFilter);
        if (sort) params.set("sort", sort);
        const res = await fetch(`/api/platform/orgs?${params}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setOrgs(data.orgs || []);
        }
      } catch (err) {
        console.error("[Platform Orgs] Load failed:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, search, tierFilter, statusFilter, checkinFilter, sort]);

  if (loading && orgs.length === 0) {
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
      <div className="mb-6">
        <h1 className="font-display text-3xl text-vc-indigo">Organizations</h1>
        <p className="mt-1 text-vc-text-secondary">
          {orgs.length} {orgs.length === 1 ? "organization" : "organizations"} on the platform.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or slug..."
          className="flex-1 min-w-[200px] rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm placeholder:text-vc-text-muted/60 focus:border-vc-coral focus:outline-none"
        />
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm"
        >
          <option value="">All Tiers</option>
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="growth">Growth</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm"
        >
          <option value="">Any Status</option>
          <option value="active">Active</option>
          <option value="dormant_14d">Dormant 14d</option>
          <option value="dormant_30d">Dormant 30d</option>
          <option value="abandoned_signup">Abandoned signup</option>
          <option value="at_risk">At risk</option>
        </select>
        <select
          value={checkinFilter}
          onChange={(e) => setCheckinFilter(e.target.value)}
          className="rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm"
        >
          <option value="">Check-in?</option>
          <option value="yes">Configured</option>
          <option value="no">Not configured</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm"
        >
          <option value="created_at">Sort: Newest</option>
          <option value="last_active">Sort: Recent activity</option>
          <option value="person_count">Sort: Members</option>
          <option value="sessions_7d">Sort: Sessions 7d</option>
        </select>
      </div>

      {/* Table */}
      {orgs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-vc-border-light bg-vc-bg-warm p-8 text-center">
          <p className="text-vc-text-secondary">No organizations match your filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-vc-border-light bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-vc-border-light bg-vc-bg-warm">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-vc-text-muted">Name</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-vc-text-muted">Tier</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-vc-text-muted">Status</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-vc-text-muted">Last active</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-vc-text-muted text-right">Members</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-vc-text-muted">Check-in</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-vc-text-muted text-right">Children</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-vc-text-muted text-right">Sessions 7d</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-vc-text-muted">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vc-border-light">
              {orgs.map((org) => {
                const status = (org.status ?? "active") as OrgStatus;
                const statusInfo = STATUS_LABEL[status];
                const childrenAlert =
                  org.tier === "free" && (org.children_count ?? 0) > 0;
                return (
                  <tr key={org.id} className="hover:bg-vc-bg-warm transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/platform/orgs/${org.id}`}
                        className="block hover:text-vc-coral"
                      >
                        <p className="font-medium text-vc-indigo hover:text-vc-coral">{org.name || "—"}</p>
                        <p className="text-xs text-vc-text-muted">{org.slug}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={TIER_BADGE[org.tier]?.variant || "default"}>
                        {org.tier}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          statusInfo.tone === "ok"
                            ? "text-xs text-vc-sage"
                            : statusInfo.tone === "warn"
                              ? "text-xs text-vc-warning"
                              : "text-xs font-semibold text-vc-coral"
                        }
                      >
                        {statusInfo.text}
                      </span>
                      {org.risk_badges && org.risk_badges.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {org.risk_badges
                            .filter((b) => !b.startsWith("dormant_"))
                            .map((b) => (
                              <span
                                key={b}
                                className="rounded-full bg-vc-coral/15 px-1.5 py-0 text-[9px] font-semibold uppercase text-vc-coral"
                              >
                                {RISK_LABEL[b] ?? b}
                              </span>
                            ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-vc-text-secondary text-xs">
                      {formatRelative(org.last_active_at)}
                    </td>
                    <td
                      className="px-4 py-3 text-right font-medium text-vc-indigo"
                      title={
                        org.member_breakdown
                          ? `Owner ${org.member_breakdown.owner} · Admin ${org.member_breakdown.admin} · Sched ${org.member_breakdown.scheduler} · Vol ${org.member_breakdown.volunteer}`
                          : undefined
                      }
                    >
                      {org.member_count ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-vc-text-secondary">
                      {org.has_checkin === undefined
                        ? "—"
                        : org.has_checkin
                          ? `✓ ${org.kiosk_count ?? 0} kiosk${(org.kiosk_count ?? 0) === 1 ? "" : "s"}`
                          : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right ${
                        childrenAlert ? "font-semibold text-vc-coral" : "text-vc-indigo"
                      }`}
                    >
                      {org.children_count ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-vc-indigo">
                      {org.sessions_7d ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-vc-text-secondary text-xs">
                      {org.created_at ? new Date(org.created_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-vc-text-muted">
        Activity data refreshes when you click &ldquo;Refresh Stats&rdquo; on the
        Platform Overview, or nightly via cron. Click any org for a full
        snapshot.
      </p>
    </div>
  );
}
