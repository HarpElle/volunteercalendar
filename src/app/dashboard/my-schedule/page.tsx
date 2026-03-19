"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments, updateDocument } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { REMINDER_CHANNELS } from "@/lib/constants";
import type { Assignment, Service, Ministry, ReminderChannel } from "@/lib/types";

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = Number(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type TabKey = "upcoming" | "past" | "availability";

export default function MySchedulePage() {
  const { user, profile, activeMembership, memberships } = useAuth();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabKey) || "upcoming";

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [services, setServices] = useState<Map<string, Service>>(new Map());
  const [ministries, setMinistries] = useState<Map<string, Ministry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // Availability state
  const [blockoutDates, setBlockoutDates] = useState<string[]>([]);
  const [newBlockout, setNewBlockout] = useState("");
  const [recurringUnavailable, setRecurringUnavailable] = useState<string[]>([]);
  const [reminderChannels, setReminderChannels] = useState<ReminderChannel[]>(["email"]);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilitySaved, setAvailabilitySaved] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  // Load schedule data
  useEffect(() => {
    async function loadAll() {
      const allAssignments: Assignment[] = [];
      const serviceMap = new Map<string, Service>();
      const ministryMap = new Map<string, Ministry>();

      const activeMembers = memberships.filter((m) => m.status === "active");
      for (const m of activeMembers) {
        try {
          const [assigns, svcs, mins] = await Promise.all([
            getChurchDocuments(m.church_id, "assignments") as Promise<unknown[]>,
            getChurchDocuments(m.church_id, "services") as Promise<unknown[]>,
            getChurchDocuments(m.church_id, "ministries") as Promise<unknown[]>,
          ]);

          const volId = m.volunteer_id;
          if (volId) {
            const myAssignments = (assigns as Assignment[]).filter(
              (a) => a.volunteer_id === volId,
            );
            allAssignments.push(...myAssignments);
          }

          for (const s of svcs as Service[]) serviceMap.set(s.id, s);
          for (const min of mins as Ministry[]) ministryMap.set(min.id, min);
        } catch {
          // Skip orgs that fail to load
        }
      }

      // Fallback: legacy profile church_id
      if (activeMembers.length === 0 && profile?.church_id) {
        try {
          const [assigns, svcs, mins] = await Promise.all([
            getChurchDocuments(profile.church_id, "assignments") as Promise<unknown[]>,
            getChurchDocuments(profile.church_id, "services") as Promise<unknown[]>,
            getChurchDocuments(profile.church_id, "ministries") as Promise<unknown[]>,
          ]);
          const vols = await getChurchDocuments(profile.church_id, "volunteers") as unknown[];
          const myVol = (vols as { id: string; user_id: string | null }[]).find(
            (v) => v.user_id === user?.uid,
          );
          if (myVol) {
            const myAssigns = (assigns as Assignment[]).filter(
              (a) => a.volunteer_id === myVol.id,
            );
            allAssignments.push(...myAssigns);
          }
          for (const s of svcs as Service[]) serviceMap.set(s.id, s);
          for (const min of mins as Ministry[]) ministryMap.set(min.id, min);
        } catch {
          // silent
        }
      }

      setAssignments(allAssignments);
      setServices(serviceMap);
      setMinistries(ministryMap);
      setLoading(false);
    }
    if (user) loadAll();
  }, [user, profile, memberships]);

  // Load availability data
  useEffect(() => {
    if (profile?.global_availability) {
      setBlockoutDates(profile.global_availability.blockout_dates || []);
      setRecurringUnavailable(profile.global_availability.recurring_unavailable || []);
    }
  }, [profile]);

  useEffect(() => {
    if (activeMembership?.reminder_preferences?.channels?.length) {
      setReminderChannels(activeMembership.reminder_preferences.channels);
    }
  }, [activeMembership]);

  // --- Schedule filtering ---

  const timeFilter = activeTab === "past" ? "past" : "upcoming";
  const filtered = activeTab !== "availability"
    ? assignments
        .filter((a) =>
          timeFilter === "upcoming"
            ? a.service_date >= today
            : a.service_date < today,
        )
        .sort((a, b) =>
          timeFilter === "upcoming"
            ? a.service_date.localeCompare(b.service_date)
            : b.service_date.localeCompare(a.service_date),
        )
    : [];

  // --- Availability handlers ---

  function addBlockout() {
    if (!newBlockout || blockoutDates.includes(newBlockout)) return;
    setBlockoutDates((prev) => [...prev, newBlockout].sort());
    setNewBlockout("");
    setAvailabilitySaved(false);
  }

  function removeBlockout(date: string) {
    setBlockoutDates((prev) => prev.filter((d) => d !== date));
    setAvailabilitySaved(false);
  }

  function toggleDay(dayIndex: string) {
    setRecurringUnavailable((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex],
    );
    setAvailabilitySaved(false);
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
    setAvailabilitySaved(false);
  }

  async function handleAvailabilitySave() {
    if (!user) return;
    setAvailabilitySaving(true);
    try {
      await updateDocument("users", user.uid, {
        global_availability: {
          blockout_dates: blockoutDates,
          recurring_unavailable: recurringUnavailable,
        },
      });
      if (activeMembership?.id) {
        await updateDocument("memberships", activeMembership.id, {
          reminder_preferences: { channels: reminderChannels },
          updated_at: new Date().toISOString(),
        });
      }
      setAvailabilitySaved(true);
    } catch {
      // silent
    } finally {
      setAvailabilitySaving(false);
    }
  }

  const futureBlockouts = blockoutDates.filter((d) => d >= today);
  const pastBlockouts = blockoutDates.filter((d) => d < today);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-vc-indigo">My Schedule</h1>
        <p className="mt-1 text-vc-text-secondary">
          Your assignments, availability, and reminder preferences.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl bg-vc-bg-warm p-1">
        {([
          { key: "upcoming" as const, label: "Upcoming" },
          { key: "past" as const, label: "Past" },
          { key: "availability" as const, label: "Availability" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key ? "bg-white text-vc-indigo shadow-sm" : "text-vc-text-secondary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Schedule list (Upcoming / Past tabs) */}
      {activeTab !== "availability" && (
        <>
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
              <svg className="mx-auto h-10 w-10 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              <p className="mt-3 text-vc-text-secondary">
                {activeTab === "upcoming"
                  ? "No upcoming assignments. You\u2019re free!"
                  : "No past assignments found."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((a) => {
                const service = a.service_id ? services.get(a.service_id) : null;
                const ministry = a.ministry_id ? ministries.get(a.ministry_id) : null;
                const isPast = a.service_date < today;
                const statusColor =
                  a.status === "confirmed"
                    ? "bg-vc-sage/15 text-vc-sage"
                    : a.status === "declined"
                      ? "bg-vc-danger/10 text-vc-danger"
                      : a.status === "draft"
                        ? "bg-gray-100 text-gray-500"
                        : "bg-vc-sand/30 text-vc-sand";

                const roleTime = service?.roles.find((r) => r.role_id === a.role_id);
                const displayStart = roleTime?.start_time || service?.start_time;
                const displayEnd = roleTime?.end_time || service?.end_time;
                const isAllDay = service?.all_day;

                return (
                  <div
                    key={a.id}
                    className={`rounded-xl border border-vc-border-light bg-white p-4 transition-shadow hover:shadow-md ${
                      isPast ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-vc-indigo">{formatDate(a.service_date)}</p>
                        <p className="mt-0.5 text-sm text-vc-text-secondary">
                          {service?.name || "Service"}
                          {ministry && (
                            <span className="ml-1.5 text-vc-text-muted">&middot; {ministry.name}</span>
                          )}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColor}`}>
                        {a.status}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center rounded-lg bg-vc-indigo/5 px-2 py-0.5 text-xs font-medium text-vc-indigo">
                        {a.role_title}
                      </span>
                      {isAllDay ? (
                        <span className="text-xs text-vc-text-muted">All day</span>
                      ) : displayStart ? (
                        <span className="text-xs text-vc-text-muted">
                          {formatTime(displayStart)}{displayEnd ? ` – ${formatTime(displayEnd)}` : ""}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Availability tab */}
      {activeTab === "availability" && (
        <>
          {/* Recurring unavailable days */}
          <div className="mb-6 rounded-2xl border border-vc-border-light bg-white p-6">
            <h2 className="text-lg font-semibold text-vc-indigo mb-1">Weekly Availability</h2>
            <p className="text-sm text-vc-text-muted mb-4">
              Mark days you&apos;re generally <strong>not available</strong>. Schedulers won&apos;t assign you on these days.
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
              Specific dates you can&apos;t serve (vacations, travel, etc.). Shared across all your organizations.
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
              Choose how you&apos;d like to be reminded about upcoming assignments.
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
                To receive SMS reminders, add your phone number in Account Settings.
              </p>
            )}
          </div>

          {/* Save */}
          <div className="flex items-center gap-3">
            <Button onClick={handleAvailabilitySave} loading={availabilitySaving}>
              Save Preferences
            </Button>
            {availabilitySaved && (
              <span className="text-sm text-vc-sage font-medium">Saved!</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
