"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { updateDocument } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function MyAvailabilityPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  // Blockout dates
  const [blockoutDates, setBlockoutDates] = useState<string[]>([]);
  const [newBlockout, setNewBlockout] = useState("");

  // Recurring unavailable days (0-6, Sun-Sat)
  const [recurringUnavailable, setRecurringUnavailable] = useState<string[]>([]);

  // Load from profile
  useEffect(() => {
    if (profile?.global_availability) {
      setBlockoutDates(profile.global_availability.blockout_dates || []);
      setRecurringUnavailable(profile.global_availability.recurring_unavailable || []);
    }
  }, [profile]);

  function addBlockout() {
    if (!newBlockout || blockoutDates.includes(newBlockout)) return;
    setBlockoutDates((prev) => [...prev, newBlockout].sort());
    setNewBlockout("");
    setSaved(false);
  }

  function removeBlockout(date: string) {
    setBlockoutDates((prev) => prev.filter((d) => d !== date));
    setSaved(false);
  }

  function toggleDay(dayIndex: string) {
    setRecurringUnavailable((prev) =>
      prev.includes(dayIndex)
        ? prev.filter((d) => d !== dayIndex)
        : [...prev, dayIndex],
    );
    setSaved(false);
  }

  async function handleSave() {
    if (!user) return;
    setLoading(true);
    try {
      await updateDocument("users", user.uid, {
        global_availability: {
          blockout_dates: blockoutDates,
          recurring_unavailable: recurringUnavailable,
        },
      });
      setSaved(true);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  const today = new Date().toISOString().split("T")[0];
  const futureBlockouts = blockoutDates.filter((d) => d >= today);
  const pastBlockouts = blockoutDates.filter((d) => d < today);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-vc-indigo">My Availability</h1>
        <p className="mt-1 text-vc-text-secondary">
          Set your availability across all organizations. Schedulers will see these when planning.
        </p>
      </div>

      {/* Recurring unavailable days */}
      <div className="mb-6 rounded-2xl border border-vc-border-light bg-white p-6">
        <h2 className="text-lg font-semibold text-vc-indigo mb-1">Weekly Availability</h2>
        <p className="text-sm text-vc-text-muted mb-4">
          Mark days you're generally <strong>not available</strong>. Schedulers won't assign you on these days.
        </p>
        <div className="grid grid-cols-7 gap-2">
          {DAYS_OF_WEEK.map((day, i) => {
            const dayStr = String(i);
            const isUnavailable = recurringUnavailable.includes(dayStr);
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(dayStr)}
                className={`rounded-xl border px-2 py-3 text-center text-xs font-medium transition-all ${
                  isUnavailable
                    ? "border-vc-danger/30 bg-vc-danger/5 text-vc-danger"
                    : "border-vc-border text-vc-text-secondary hover:border-vc-sage/50 hover:bg-vc-sage/5"
                }`}
              >
                <span className="block sm:hidden">{day.slice(0, 2)}</span>
                <span className="hidden sm:block">{day.slice(0, 3)}</span>
                <span className="mt-1 block text-[10px]">
                  {isUnavailable ? "Off" : "Available"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Blockout dates */}
      <div className="mb-6 rounded-2xl border border-vc-border-light bg-white p-6">
        <h2 className="text-lg font-semibold text-vc-indigo mb-1">Blockout Dates</h2>
        <p className="text-sm text-vc-text-muted mb-4">
          Specific dates you can't serve (vacations, travel, etc.). Shared across all your organizations.
        </p>

        <div className="flex gap-2 mb-4">
          <input
            type="date"
            min={today}
            value={newBlockout}
            onChange={(e) => setNewBlockout(e.target.value)}
            className="flex-1 rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
          />
          <button
            onClick={addBlockout}
            disabled={!newBlockout}
            className="rounded-lg bg-vc-coral px-4 py-2 text-sm font-medium text-white hover:bg-vc-coral-dark transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {futureBlockouts.length === 0 ? (
          <p className="text-sm text-vc-text-muted italic">No upcoming blockout dates.</p>
        ) : (
          <div className="space-y-1">
            {futureBlockouts.map((date) => {
              const d = new Date(date + "T00:00:00");
              return (
                <div key={date} className="flex items-center justify-between rounded-lg bg-vc-bg-warm px-3 py-2">
                  <span className="text-sm text-vc-indigo">
                    {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <button
                    onClick={() => removeBlockout(date)}
                    className="text-xs text-vc-text-muted hover:text-vc-danger transition-colors"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {pastBlockouts.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setBlockoutDates((prev) => prev.filter((d) => d >= today))}
              className="text-xs text-vc-text-muted hover:text-vc-coral transition-colors"
            >
              Clear {pastBlockouts.length} past blockout{pastBlockouts.length !== 1 ? "s" : ""}
            </button>
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={loading}>
          Save Availability
        </Button>
        {saved && (
          <span className="text-sm text-vc-sage font-medium">Saved!</span>
        )}
      </div>
    </div>
  );
}
