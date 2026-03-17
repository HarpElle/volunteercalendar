"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { updateDocument } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { REMINDER_CHANNELS } from "@/lib/constants";
import type { ReminderChannel } from "@/lib/types";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function MyAvailabilityPage() {
  const { user, profile, activeMembership } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  // Blockout dates
  const [blockoutDates, setBlockoutDates] = useState<string[]>([]);
  const [newBlockout, setNewBlockout] = useState("");

  // Recurring unavailable days (0-6, Sun-Sat)
  const [recurringUnavailable, setRecurringUnavailable] = useState<string[]>([]);

  // Reminder preferences
  const [reminderChannels, setReminderChannels] = useState<ReminderChannel[]>(["email"]);

  // Load from profile
  useEffect(() => {
    if (profile?.global_availability) {
      setBlockoutDates(profile.global_availability.blockout_dates || []);
      setRecurringUnavailable(profile.global_availability.recurring_unavailable || []);
    }
  }, [profile]);

  // Load reminder preferences from membership
  useEffect(() => {
    if (activeMembership?.reminder_preferences?.channels?.length) {
      setReminderChannels(activeMembership.reminder_preferences.channels);
    }
  }, [activeMembership]);

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

  function toggleReminderChannel(channel: ReminderChannel) {
    setReminderChannels((prev) => {
      if (channel === "none") return ["none"];
      const without = prev.filter((c) => c !== "none");
      if (without.includes(channel)) {
        const result = without.filter((c) => c !== channel);
        return result.length === 0 ? ["none"] : result;
      }
      return [...without, channel];
    });
    setSaved(false);
  }

  async function handleSave() {
    if (!user) return;
    setLoading(true);
    try {
      // Save availability to user profile
      await updateDocument("users", user.uid, {
        global_availability: {
          blockout_dates: blockoutDates,
          recurring_unavailable: recurringUnavailable,
        },
      });

      // Save reminder preferences to membership (if active)
      if (activeMembership?.id) {
        await updateDocument("memberships", activeMembership.id, {
          reminder_preferences: { channels: reminderChannels },
          updated_at: new Date().toISOString(),
        });
      }

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

      {/* Reminder preferences */}
      <div className="mb-6 rounded-2xl border border-vc-border-light bg-white p-6">
        <h2 className="text-lg font-semibold text-vc-indigo mb-1">Reminder Preferences</h2>
        <p className="text-sm text-vc-text-muted mb-4">
          Choose how you'd like to be reminded about upcoming assignments.
        </p>
        <div className="space-y-2">
          {REMINDER_CHANNELS.map((opt) => {
            const isActive = reminderChannels.includes(opt.value);
            const isNone = opt.value === "none";
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleReminderChannel(opt.value)}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                  isActive
                    ? isNone
                      ? "border-vc-text-muted/30 bg-vc-bg-warm text-vc-text-secondary"
                      : "border-vc-coral/30 bg-vc-coral/5 text-vc-indigo"
                    : "border-vc-border text-vc-text-secondary hover:border-vc-border-light hover:bg-vc-bg-warm"
                }`}
              >
                <div className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                  isActive
                    ? isNone
                      ? "border-vc-text-muted bg-vc-text-muted text-white"
                      : "border-vc-coral bg-vc-coral text-white"
                    : "border-vc-border"
                }`}>
                  {isActive && (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </div>
                <div>
                  <span className="font-medium">{opt.label}</span>
                  {opt.value === "email" && (
                    <span className="ml-1.5 text-xs text-vc-text-muted">48hr + 24hr before</span>
                  )}
                  {opt.value === "sms" && (
                    <span className="ml-1.5 text-xs text-vc-text-muted">24hr before (requires phone number)</span>
                  )}
                  {opt.value === "calendar" && (
                    <span className="ml-1.5 text-xs text-vc-text-muted">via iCal feed events</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {reminderChannels.includes("sms") && !profile?.phone && (
          <p className="mt-3 text-xs text-vc-sand-dark">
            To receive SMS reminders, add your phone number in your profile settings.
          </p>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={loading}>
          Save Preferences
        </Button>
        {saved && (
          <span className="text-sm text-vc-sage font-medium">Saved!</span>
        )}
      </div>
    </div>
  );
}
