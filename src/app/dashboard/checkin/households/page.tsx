"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface HouseholdSummary {
  id: string;
  primary_guardian_name: string;
  primary_guardian_phone: string;
  created_at: string;
  children_count?: number;
}

/**
 * /dashboard/checkin/households — Searchable household list with Add Household.
 */
export default function HouseholdsPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;
  const router = useRouter();
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const fetchHouseholds = useCallback(async () => {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
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
        <Button size="sm" onClick={() => setShowForm(true)}>
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Household
        </Button>
      </div>
      <p className="mb-4 -mt-4 text-sm text-vc-text-secondary">
        Manage guardian-child relationships for children&apos;s check-in.
      </p>

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
        <div className="text-center py-12">
          <p className="text-gray-500">
            {search ? "No households match your search" : "No households registered yet"}
          </p>
          {!search && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 text-sm text-vc-coral hover:text-vc-coral-dark font-medium transition-colors"
            >
              Add your first household
            </button>
          )}
        </div>
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

      {/* Add Household Modal */}
      <AnimatePresence>
        {showForm && (
          <AddHouseholdModal
            onClose={() => setShowForm(false)}
            onCreated={(id) => {
              setShowForm(false);
              fetchHouseholds();
              router.push(`/dashboard/checkin/households/${id}`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface AddHouseholdModalProps {
  onClose: () => void;
  onCreated: (householdId: string) => void;
}

function AddHouseholdModal({ onClose, onCreated }: AddHouseholdModalProps) {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [primaryName, setPrimaryName] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [secondaryName, setSecondaryName] = useState("");
  const [secondaryPhone, setSecondaryPhone] = useState("");
  const [showSecondary, setShowSecondary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !churchId) return;
    setError("");
    setSaving(true);

    try {
      const token = await user.getIdToken();
      const body: Record<string, string> = {
        church_id: churchId,
        primary_guardian_name: primaryName.trim(),
        primary_guardian_phone: primaryPhone.trim(),
      };
      if (showSecondary && secondaryName.trim()) {
        body.secondary_guardian_name = secondaryName.trim();
      }
      if (showSecondary && secondaryPhone.trim()) {
        body.secondary_guardian_phone = secondaryPhone.trim();
      }

      const res = await fetch("/api/admin/checkin/household", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to create household (${res.status})`);
      }

      const data = await res.json();
      onCreated(data.household?.id || data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputClasses =
    "w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none transition-colors text-sm";
  const labelClasses = "block text-sm font-medium text-vc-indigo mb-1";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 12 }}
        transition={{ type: "spring", duration: 0.35 }}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="font-display text-lg font-semibold text-vc-indigo mb-1">
          Add Household
        </h2>
        <p className="text-sm text-vc-text-secondary mb-5">
          Create a guardian household, then add children from the detail page.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Primary guardian */}
          <div>
            <label htmlFor="primary-name" className={labelClasses}>
              Primary guardian name <span className="text-vc-coral">*</span>
            </label>
            <input
              id="primary-name"
              type="text"
              required
              value={primaryName}
              onChange={(e) => setPrimaryName(e.target.value)}
              placeholder="e.g. Sarah Johnson"
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="primary-phone" className={labelClasses}>
              Phone number <span className="text-vc-coral">*</span>
            </label>
            <input
              id="primary-phone"
              type="tel"
              required
              value={primaryPhone}
              onChange={(e) => setPrimaryPhone(e.target.value)}
              placeholder="(555) 123-4567"
              className={inputClasses}
            />
            <p className="text-xs text-vc-text-muted mt-1">
              Used for kiosk lookup (last 4 digits)
            </p>
          </div>

          {/* Secondary guardian toggle */}
          {!showSecondary ? (
            <button
              type="button"
              onClick={() => setShowSecondary(true)}
              className="text-sm text-vc-coral hover:text-vc-coral-dark font-medium transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add secondary guardian
            </button>
          ) : (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-vc-indigo">Secondary guardian</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowSecondary(false);
                    setSecondaryName("");
                    setSecondaryPhone("");
                  }}
                  className="text-xs text-vc-text-muted hover:text-vc-text-secondary transition-colors"
                >
                  Remove
                </button>
              </div>
              <div>
                <label htmlFor="secondary-name" className={labelClasses}>Name</label>
                <input
                  id="secondary-name"
                  type="text"
                  value={secondaryName}
                  onChange={(e) => setSecondaryName(e.target.value)}
                  placeholder="e.g. Mike Johnson"
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="secondary-phone" className={labelClasses}>Phone</label>
                <input
                  id="secondary-phone"
                  type="tel"
                  value={secondaryPhone}
                  onChange={(e) => setSecondaryPhone(e.target.value)}
                  placeholder="(555) 987-6543"
                  className={inputClasses}
                />
              </div>
            </motion.div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" type="submit" loading={saving} disabled={!primaryName.trim() || !primaryPhone.trim()}>
              Create Household
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
