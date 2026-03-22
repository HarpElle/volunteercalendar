"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import Link from "next/link";

interface HouseholdSummary {
  id: string;
  primary_guardian_name: string;
  primary_guardian_phone: string;
  created_at: string;
  children_count?: number;
}

/**
 * /dashboard/checkin/households — Searchable household list.
 */
export default function HouseholdsPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchHouseholds = useCallback(async () => {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      // Use the first-time report to get households (there's no dedicated list endpoint)
      // For now, fetch all children grouped by household
      const res = await fetch(
        `/api/admin/checkin/children?church_id=${churchId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return;
      const data = await res.json();

      // Group children by household
      const householdMap = new Map<string, { count: number }>();
      for (const child of data.children || []) {
        const entry = householdMap.get(child.household_id) || { count: 0 };
        entry.count++;
        householdMap.set(child.household_id, entry);
      }

      // Fetch household details for each unique household
      const results: HouseholdSummary[] = [];
      for (const [householdId, info] of householdMap) {
        try {
          const hRes = await fetch(
            `/api/admin/checkin/household/${householdId}?church_id=${churchId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (hRes.ok) {
            const hData = await hRes.json();
            results.push({
              ...hData.household,
              children_count: info.count,
            });
          }
        } catch {
          // skip
        }
      }

      setHouseholds(results);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, churchId]);

  useEffect(() => {
    fetchHouseholds();
  }, [fetchHouseholds]);

  const filtered = households.filter((h) =>
    h.primary_guardian_name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-vc-indigo font-display">
          Households
        </h1>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by guardian name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2.5 rounded-xl border border-gray-200
            focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none transition-colors"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-12">
          {search ? "No households match your search" : "No households registered yet"}
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {filtered.map((h) => (
            <Link
              key={h.id}
              href={`/dashboard/checkin/households/${h.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-vc-bg-warm transition-colors"
            >
              <div>
                <p className="font-medium text-vc-indigo">
                  {h.primary_guardian_name}
                </p>
                <p className="text-sm text-gray-500">
                  {h.children_count || 0} child{(h.children_count || 0) !== 1 ? "ren" : ""}
                  {" "}&middot;{" "}
                  {h.primary_guardian_phone ? `***${h.primary_guardian_phone.slice(-4)}` : "No phone"}
                </p>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
