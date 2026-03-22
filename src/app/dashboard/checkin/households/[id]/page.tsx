"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import Link from "next/link";
import type { CheckInHousehold, Child } from "@/lib/types";

/**
 * /dashboard/checkin/households/[id] — Household detail page.
 * Shows guardian info, children list, QR code management.
 */
export default function HouseholdDetailPage() {
  const { id } = useParams();
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [household, setHousehold] = useState<CheckInHousehold | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user || !churchId || !id) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/household/${id}?church_id=${churchId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setHousehold(data.household);
        setChildren(data.children || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, churchId, id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRegenerateQR = async () => {
    if (!user || !churchId || !id) return;
    setRegenerating(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/household/${id}/regenerate-qr`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ church_id: churchId }),
        },
      );
      if (res.ok) {
        await fetchData();
      }
    } catch {
      // silent
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-gray-100 animate-pulse" />
        <div className="h-32 rounded-xl bg-gray-100 animate-pulse" />
      </div>
    );
  }

  if (!household) {
    return <p className="text-gray-500">Household not found.</p>;
  }

  return (
    <div>
      <Link
        href="/dashboard/checkin/households"
        className="text-sm text-vc-coral font-medium mb-4 inline-block"
      >
        &larr; Back to Households
      </Link>

      <h1 className="text-2xl font-bold text-vc-indigo font-display mb-6">
        {household.primary_guardian_name}
      </h1>

      {/* Guardian info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Guardian Information
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400">Primary Guardian</p>
            <p className="font-medium text-vc-indigo">
              {household.primary_guardian_name}
            </p>
            <p className="text-sm text-gray-500">
              {household.primary_guardian_phone}
            </p>
          </div>
          {household.secondary_guardian_name && (
            <div>
              <p className="text-xs text-gray-400">Secondary Guardian</p>
              <p className="font-medium text-vc-indigo">
                {household.secondary_guardian_name}
              </p>
              <p className="text-sm text-gray-500">
                {household.secondary_guardian_phone || "—"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* QR Token */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          QR Check-In Token
        </h2>
        <div className="flex items-center gap-3">
          <code className="text-sm bg-gray-50 px-3 py-1.5 rounded font-mono text-vc-indigo">
            {household.qr_token}
          </code>
          <button
            type="button"
            onClick={handleRegenerateQR}
            disabled={regenerating}
            className="text-sm text-vc-coral font-medium underline disabled:opacity-50"
          >
            {regenerating ? "Regenerating..." : "Regenerate"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Regenerating invalidates the old QR code. The family will need a new printout.
        </p>
      </div>

      {/* Children */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Children ({children.length})
        </h2>
        {children.length === 0 ? (
          <p className="text-gray-400">No children registered</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {children.map((child) => (
              <div key={child.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-vc-indigo">
                    {child.preferred_name || child.first_name} {child.last_name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {child.grade && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-vc-indigo/10 text-vc-indigo/70">
                        {child.grade}
                      </span>
                    )}
                    {child.has_alerts && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        Allergy/Medical
                      </span>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-medium ${child.is_active ? "text-vc-sage" : "text-gray-400"}`}>
                  {child.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
