"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import type { SubscriptionTier } from "@/lib/types";

interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  tier: SubscriptionTier;
  subscription_source: string;
  person_count: number;
  created_at: string;
}

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

export default function PlatformOrgsPage() {
  const { user } = useAuth();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");

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

        const res = await fetch("/api/platform/orgs", { headers });
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
  }, [user]);

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

  const filtered = orgs.filter((o) => {
    if (search) {
      const q = search.toLowerCase();
      if (!o.name.toLowerCase().includes(q) && !o.slug.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (tierFilter && o.tier !== tierFilter) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-vc-indigo">Organizations</h1>
        <p className="mt-1 text-vc-text-secondary">
          {orgs.length} total organizations on the platform.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name..."
          className="flex-1 rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm placeholder:text-vc-text-muted/60 focus:border-vc-coral focus:outline-none"
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
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-vc-border-light bg-vc-bg-warm p-8 text-center">
          <p className="text-vc-text-secondary">No organizations match your filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-vc-border-light bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-vc-border-light bg-vc-bg-warm">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-vc-text-muted">
                  Name
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-vc-text-muted">
                  Tier
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-vc-text-muted text-right">
                  People
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-vc-text-muted">
                  Created
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-vc-text-muted">
                  Source
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vc-border-light">
              {filtered.map((org) => (
                <tr key={org.id} className="hover:bg-vc-bg-warm transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-vc-indigo">{org.name}</p>
                    <p className="text-xs text-vc-text-muted">{org.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={TIER_BADGE[org.tier]?.variant || "default"}>
                      {org.tier}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-vc-indigo">
                    {org.person_count ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-vc-text-secondary">
                    {new Date(org.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-vc-text-muted">
                    {org.subscription_source || "stripe"}
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
