"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import type { Person } from "@/lib/types";

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

  const [volunteer, setVolunteer] = useState<Person | null>(null);
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
  const [preferredWeeks, setPreferredWeeks] = useState<number[]>([]);

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
        const vol = json.volunteer as Person | null;
        if (!cancelled && vol) {
          setVolunteer(vol);
          const sp = vol.scheduling_profile;
          setBlockoutDates(sp?.blockout_dates || []);
          setRecurringUnavailable(sp?.recurring_unavailable || []);
          setPreferredFrequency(sp?.preferred_frequency ?? 1);
          setMaxRolesPerMonth(sp?.max_roles_per_month ?? 0);
          setPreferredWeeks(sp?.preferred_weeks ?? []);
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
            preferred_weeks: preferredWeeks,
          },
        }),
      });
      if (res.ok) {
        setSaved(true);
        if (savedTimeout.current) clearTimeout(savedTimeout.current);
        savedTimeout.current = setTimeout(() => setSaved(false), 3000);
        // Sync availability to global user profile across all orgs
        user.getIdToken().then((t) =>
          fetch("/api/account/sync-profile", {
            method: "POST",
            headers: { Authorization: `Bearer ${t}` },
          }).catch(() => {}),
        );
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
    preferredWeeks,
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
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
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
        <svg
          className="mx-auto h-12 w-12 text-vc-text-muted"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
          />
        </svg>
        <h3 className="mt-3 text-base font-semibold text-vc-indigo">
          No volunteer profile yet
        </h3>
        <p className="mt-1 text-sm text-vc-text-secondary">
          Contact your admin to be added as a volunteer.
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const futureBlockouts = blockoutDates.filter((d) => d >= today);
  const pastBlockouts = blockoutDates.filter((d) => d < today);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">
          Your Availability
        </h1>
        <p className="mt-1 text-vc-text-secondary">
          Let your team know when you're unavailable so they can plan around
          your schedule.
        </p>
      </div>

      {/* Recurring Unavailable Days */}
      <section className="mb-6 rounded-xl border border-vc-border-light bg-vc-bg-warm p-5">
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
                    : "bg-vc-sand/20 text-vc-text-secondary hover:bg-vc-sand/35"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </section>

      {/* Preferred Weeks */}
      <section className="mb-6 rounded-xl border border-vc-border-light bg-vc-bg-warm p-5">
        <h2 className="mb-1 font-display text-lg text-vc-indigo">
          Preferred Weeks to Serve
        </h2>
        <p className="mb-4 text-sm text-vc-text-secondary">
          Select which weeks of the month you prefer to serve. Leave empty if you have no preference.
        </p>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((week) => {
            const active = preferredWeeks.includes(week);
            const labels = ["1st", "2nd", "3rd", "4th", "5th"];
            return (
              <button
                key={week}
                onClick={() =>
                  setPreferredWeeks((prev) =>
                    prev.includes(week)
                      ? prev.filter((w) => w !== week)
                      : [...prev, week].sort(),
                  )
                }
                className={`min-h-[44px] rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-vc-sage text-white"
                    : "bg-vc-sand/20 text-vc-text-secondary hover:bg-vc-sand/35"
                }`}
              >
                {labels[week - 1]} week
              </button>
            );
          })}
        </div>
      </section>

      {/* Blockout Dates */}
      <section className="mb-6 rounded-xl border border-vc-border-light bg-vc-bg-warm p-5">
        <h2 className="mb-1 font-display text-lg text-vc-indigo">
          Unavailable Dates
        </h2>
        <p className="mb-4 text-sm text-vc-text-secondary">
          Specific dates you can't serve — vacations, trips, family events.
        </p>

        {/* Add new */}
        <div className="mb-4 flex items-center gap-2">
          <input
            type="date"
            value={newBlockoutDate}
            min={today}
            onChange={(e) => setNewBlockoutDate(e.target.value)}
            className="min-h-[44px] rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
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
          <p className="text-sm text-vc-text-muted">
            No unavailable dates set. Your team will assume you're available for
            scheduling.
          </p>
        ) : (
          <div className="space-y-1.5">
            {futureBlockouts.map((date) => (
              <div
                key={date}
                className="flex items-center justify-between rounded-lg bg-white px-3 py-2"
              >
                <span className="text-sm text-vc-text">
                  {new Date(date + "T12:00:00").toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <button
                  onClick={() => removeBlockoutDate(date)}
                  className="flex h-8 w-8 items-center justify-center rounded text-vc-text-muted transition-colors hover:text-vc-danger"
                  aria-label={`Remove ${date}`}
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
                {pastBlockouts.length} past date
                {pastBlockouts.length !== 1 ? "s" : ""} will be cleaned up on
                save.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Preferences */}
      <section className="mb-6 rounded-xl border border-vc-border-light bg-vc-bg-warm p-5">
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
              className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
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
              className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
            />
          </div>
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saving}>
          Save Availability
        </Button>
        {saved && <Badge variant="success">Saved</Badge>}
      </div>
    </div>
  );
}
