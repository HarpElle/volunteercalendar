"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import type { Volunteer, VolunteerAvailability } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MyAvailabilityPage() {
  const { user, profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [volunteer, setVolunteer] = useState<Volunteer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable availability state
  const [blockoutDates, setBlockoutDates] = useState<string[]>([]);
  const [recurringUnavailable, setRecurringUnavailable] = useState<string[]>(
    [],
  );
  const [preferredFrequency, setPreferredFrequency] = useState(1);
  const [maxRolesPerMonth, setMaxRolesPerMonth] = useState(0);

  // New blockout date input
  const [newBlockoutDate, setNewBlockoutDate] = useState("");

  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Fetch ----

  useEffect(() => {
    if (!user || !churchId) return;
    let cancelled = false;
    async function load() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch(
          `/api/my-availability?church_id=${encodeURIComponent(churchId!)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error("Failed to load");
        const json = await res.json();
        const vol = json.volunteer as Volunteer | null;
        if (!cancelled && vol) {
          setVolunteer(vol);
          const a = vol.availability;
          setBlockoutDates(a?.blockout_dates || []);
          setRecurringUnavailable(a?.recurring_unavailable || []);
          setPreferredFrequency(a?.preferred_frequency ?? 1);
          setMaxRolesPerMonth(a?.max_roles_per_month ?? 0);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, churchId]);

  // ---- Save ----

  const handleSave = useCallback(async () => {
    if (!user || !churchId) return;
    setSaving(true);
    setSaved(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/my-availability", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          church_id: churchId,
          availability: {
            blockout_dates: blockoutDates,
            recurring_unavailable: recurringUnavailable,
            preferred_frequency: preferredFrequency,
            max_roles_per_month: maxRolesPerMonth,
          } satisfies VolunteerAvailability,
        }),
      });
      if (res.ok) {
        setSaved(true);
        if (savedTimeout.current) clearTimeout(savedTimeout.current);
        savedTimeout.current = setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [
    user,
    churchId,
    blockoutDates,
    recurringUnavailable,
    preferredFrequency,
    maxRolesPerMonth,
  ]);

  // ---- Blockout helpers ----

  function addBlockoutDate() {
    if (!newBlockoutDate || blockoutDates.includes(newBlockoutDate)) return;
    setBlockoutDates((prev) =>
      [...prev, newBlockoutDate].sort((a, b) => a.localeCompare(b)),
    );
    setNewBlockoutDate("");
  }

  function removeBlockoutDate(date: string) {
    setBlockoutDates((prev) => prev.filter((d) => d !== date));
  }

  function toggleRecurringDay(day: string) {
    setRecurringUnavailable((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day],
    );
  }

  // ---- Render ----

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!volunteer) {
    return (
      <div className="px-4 py-20 text-center">
        <p className="text-vc-text-secondary">
          No volunteer record found for your account. Contact your admin to be
          added as a volunteer.
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  // Filter out past blockout dates for display
  const futureBlockouts = blockoutDates.filter((d) => d >= today);
  const pastBlockouts = blockoutDates.filter((d) => d < today);

  return (
    <div className="min-h-screen bg-vc-bg px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl text-vc-indigo">
            My Availability
          </h1>
          <p className="mt-1 text-vc-text-secondary">
            Let your team know when you're available to serve.
          </p>
        </div>

        {/* Recurring Unavailable Days */}
        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-1 font-display text-lg text-vc-indigo">
            Recurring Days Off
          </h2>
          <p className="mb-4 text-sm text-vc-text-secondary">
            Select days you're regularly unavailable.
          </p>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((day) => {
              const active = recurringUnavailable.includes(day);
              return (
                <button
                  key={day}
                  onClick={() => toggleRecurringDay(day)}
                  className={`min-h-[44px] rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-vc-coral text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </section>

        {/* Blockout Dates */}
        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-1 font-display text-lg text-vc-indigo">
            Blockout Dates
          </h2>
          <p className="mb-4 text-sm text-vc-text-secondary">
            Specific dates you can't serve (vacations, trips, etc.).
          </p>

          {/* Add new */}
          <div className="mb-4 flex items-center gap-2">
            <input
              type="date"
              value={newBlockoutDate}
              min={today}
              onChange={(e) => setNewBlockoutDate(e.target.value)}
              className="min-h-[44px] rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-vc-coral"
            />
            <Button
              size="sm"
              onClick={addBlockoutDate}
              disabled={!newBlockoutDate}
            >
              Add Date
            </Button>
          </div>

          {/* List */}
          {futureBlockouts.length === 0 && pastBlockouts.length === 0 ? (
            <p className="text-sm italic text-vc-text-muted">
              No blockout dates set.
            </p>
          ) : (
            <div className="space-y-1.5">
              {futureBlockouts.map((date) => (
                <div
                  key={date}
                  className="flex items-center justify-between rounded-lg bg-vc-bg px-3 py-2"
                >
                  <span className="text-sm text-vc-text">
                    {new Date(date + "T12:00:00").toLocaleDateString(
                      undefined,
                      {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      },
                    )}
                  </span>
                  <button
                    onClick={() => removeBlockoutDate(date)}
                    className="flex h-8 w-8 items-center justify-center rounded text-gray-400 transition-colors hover:text-vc-danger"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18 18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
              {pastBlockouts.length > 0 && (
                <p className="pt-2 text-xs text-vc-text-muted">
                  {pastBlockouts.length} past blockout date
                  {pastBlockouts.length !== 1 ? "s" : ""} (auto-cleaned on
                  save)
                </p>
              )}
            </div>
          )}
        </section>

        {/* Preferences */}
        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-1 font-display text-lg text-vc-indigo">
            Scheduling Preferences
          </h2>
          <p className="mb-4 text-sm text-vc-text-secondary">
            Help schedulers plan around your capacity.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
                Preferred frequency (weeks between)
              </label>
              <select
                value={preferredFrequency}
                onChange={(e) =>
                  setPreferredFrequency(parseInt(e.target.value, 10))
                }
                className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-vc-coral"
              >
                <option value={1}>Every week</option>
                <option value={2}>Every other week</option>
                <option value={3}>Every 3 weeks</option>
                <option value={4}>Once a month</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
                Max roles per month
              </label>
              <input
                type="number"
                min={0}
                value={maxRolesPerMonth || ""}
                onChange={(e) =>
                  setMaxRolesPerMonth(
                    e.target.value ? parseInt(e.target.value, 10) : 0,
                  )
                }
                placeholder="0 = no limit"
                className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-vc-coral"
              />
            </div>
          </div>
        </section>

        {/* Save */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} loading={saving}>
            Save Availability
          </Button>
          {saved && (
            <Badge variant="success">Saved</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
