"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import {
  addChurchDocument,
  getChurchDocuments,
  updateChurchDocument,
  removeChurchDocument,
  getEventSignupsBatch,
} from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Select } from "@/components/ui/select";
import { ShortLinkCreator } from "@/components/ui/short-link-creator";
import { ShareMenu } from "@/components/ui/share-menu";
import { EventRoster } from "@/components/scheduling/event-roster";
import { isAdmin, isScheduler } from "@/lib/utils/permissions";
import { TIER_LIMITS } from "@/lib/constants";
import { getAuth } from "firebase/auth";
import type {
  Service,
  ServiceRole,
  Event,
  EventType,
  EventVisibility,
  SignupMode,
  RecurrencePattern,
  RoleSlot,
  Ministry,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAYS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const RECURRENCE_OPTIONS: { value: RecurrencePattern; label: string }[] = [
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every other week" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
];

const EVENT_RECURRENCE_OPTIONS: { value: RecurrencePattern; label: string }[] = [
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every other week" },
  { value: "monthly", label: "Monthly" },
];

const SIGNUP_MODES: { value: SignupMode; label: string }[] = [
  { value: "open", label: "Open signup \u2014 volunteers pick their own roles" },
  { value: "scheduled", label: "Scheduled \u2014 scheduler assigns roles" },
  { value: "hybrid", label: "Hybrid \u2014 scheduler assigns, volunteers fill remaining" },
];

const VISIBILITY_OPTIONS: { value: EventVisibility; label: string }[] = [
  { value: "internal", label: "Internal \u2014 members only" },
  { value: "public", label: "Public \u2014 anyone with the link" },
];

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: "one_time", label: "One-time event" },
  { value: "recurring", label: "Recurring event" },
];

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ServicesEventsPage() {
  return (
    <Suspense>
      <ServicesEventsContent />
    </Suspense>
  );
}

function ServicesEventsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "events" ? "events" : "services";
  const [tab, setTab] = useState<"services" | "events">(initialTab);

  const { profile, user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [churchName, setChurchName] = useState("");
  const [churchTier, setChurchTier] = useState("free");
  const [loading, setLoading] = useState(true);

  // Shared data: ministries + church name + tier
  useEffect(() => {
    if (!churchId) return;
    Promise.all([
      getChurchDocuments(churchId, "ministries"),
      import("firebase/firestore").then(({ doc, getDoc }) =>
        getDoc(doc(db, "churches", churchId)),
      ),
    ])
      .then(([mins, churchSnap]) => {
        setMinistries(mins as unknown as Ministry[]);
        if (churchSnap.exists()) {
          setChurchName(churchSnap.data().name || "");
          setChurchTier(churchSnap.data().subscription_tier || "free");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [churchId]);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Services & Events</h1>
        <p className="mt-1 text-vc-text-secondary">
          Configure recurring services and create events that need volunteers.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-vc-bg-warm p-1">
        <button
          onClick={() => setTab("services")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "services" ? "bg-white text-vc-indigo shadow-sm" : "text-vc-text-secondary"
          }`}
        >
          Services
        </button>
        <button
          onClick={() => setTab("events")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "events" ? "bg-white text-vc-indigo shadow-sm" : "text-vc-text-secondary"
          }`}
        >
          Events
        </button>
      </div>

      {tab === "services" ? (
        <ServicesTab churchId={churchId} churchTier={churchTier} ministries={ministries} loading={loading} />
      ) : (
        <EventsTab churchId={churchId} churchName={churchName} churchTier={churchTier} user={user} activeMembership={activeMembership} ministries={ministries} loading={loading} />
      )}
    </div>
  );
}

// ===========================================================================
// SERVICES TAB
// ===========================================================================

function ServicesTab({
  churchId,
  churchTier,
  ministries,
  loading: ministriesLoading,
}: {
  churchId: string | undefined;
  churchTier: string;
  ministries: Ministry[];
  loading: boolean;
}) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrencePattern>("weekly");
  const [dayOfWeek, setDayOfWeek] = useState("0");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:30");
  const [allDay, setAllDay] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState("90");

  // Multi-ministry form state
  type FormMinistry = {
    id: string; // local form ID
    ministry_id: string;
    roles: ServiceRole[];
    start_time: string | null;
    end_time: string | null;
  };
  const [formMinistries, setFormMinistries] = useState<FormMinistry[]>([
    {
      id: crypto.randomUUID(),
      ministry_id: "",
      roles: [{ role_id: crypto.randomUUID(), title: "", count: 1 }],
      start_time: null,
      end_time: null,
    },
  ]);

  useEffect(() => {
    if (!churchId) return;
    getChurchDocuments(churchId, "services")
      .then((svcs) => setServices(svcs as unknown as Service[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [churchId]);

  function resetForm() {
    setName("");
    setRecurrence("weekly");
    setDayOfWeek("0");
    setStartTime("09:00");
    setEndTime("10:30");
    setAllDay(false);
    setDurationMinutes("90");
    setFormMinistries([
      {
        id: crypto.randomUUID(),
        ministry_id: "",
        roles: [{ role_id: crypto.randomUUID(), title: "", count: 1 }],
        start_time: null,
        end_time: null,
      },
    ]);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(s: Service) {
    setName(s.name);
    setRecurrence(s.recurrence);
    setDayOfWeek(String(s.day_of_week));
    setStartTime(s.start_time);
    setEndTime(s.end_time || "");
    setAllDay(s.all_day || false);
    setDurationMinutes(String(s.duration_minutes));

    // Load ministries from new format or legacy
    if (s.ministries && s.ministries.length > 0) {
      setFormMinistries(
        s.ministries.map((m) => ({
          id: crypto.randomUUID(),
          ministry_id: m.ministry_id,
          roles: m.roles.length > 0 ? m.roles : [{ role_id: crypto.randomUUID(), title: "", count: 1 }],
          start_time: m.start_time,
          end_time: m.end_time,
        })),
      );
    } else {
      setFormMinistries([
        {
          id: crypto.randomUUID(),
          ministry_id: s.ministry_id,
          roles: s.roles.length > 0 ? s.roles : [{ role_id: crypto.randomUUID(), title: "", count: 1 }],
          start_time: null,
          end_time: null,
        },
      ]);
    }
    setEditingId(s.id);
    setShowForm(true);
  }

  function addMinistrySection() {
    setFormMinistries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        ministry_id: "",
        roles: [{ role_id: crypto.randomUUID(), title: "", count: 1 }],
        start_time: null,
        end_time: null,
      },
    ]);
  }

  function removeMinistrySection(fmId: string) {
    setFormMinistries((prev) => prev.filter((m) => m.id !== fmId));
  }

  function updateMinistryField(fmId: string, field: string, value: string | null) {
    setFormMinistries((prev) =>
      prev.map((m) => (m.id === fmId ? { ...m, [field]: value } : m)),
    );
  }

  const svcTierLimits = TIER_LIMITS[churchTier] || TIER_LIMITS.free;
  const [svcTierWarning, setSvcTierWarning] = useState("");

  function addRoleToMinistry(fmId: string) {
    const totalRoles = formMinistries.reduce((sum, m) => sum + m.roles.length, 0);
    if (totalRoles >= svcTierLimits.roles_per_service) {
      setSvcTierWarning(`Your plan allows up to ${svcTierLimits.roles_per_service} roles per service. Upgrade to add more.`);
      return;
    }
    setSvcTierWarning("");
    setFormMinistries((prev) =>
      prev.map((m) =>
        m.id === fmId
          ? { ...m, roles: [...m.roles, { role_id: crypto.randomUUID(), title: "", count: 1 }] }
          : m,
      ),
    );
  }

  function updateRoleInMinistry(fmId: string, roleIdx: number, field: string, value: string | number | null) {
    setFormMinistries((prev) =>
      prev.map((m) =>
        m.id === fmId
          ? { ...m, roles: m.roles.map((r, i) => (i === roleIdx ? { ...r, [field]: value } : r)) }
          : m,
      ),
    );
  }

  function removeRoleFromMinistry(fmId: string, roleIdx: number) {
    setFormMinistries((prev) =>
      prev.map((m) =>
        m.id === fmId
          ? { ...m, roles: m.roles.filter((_, i) => i !== roleIdx) }
          : m,
      ),
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!churchId) return;
    setSaving(true);

    try {
      // Build ministries array
      const builtMinistries = formMinistries
        .filter((m) => m.ministry_id)
        .map((m) => ({
          ministry_id: m.ministry_id,
          roles: m.roles.filter((r) => r.title.trim()),
          start_time: m.start_time || null,
          end_time: m.end_time || null,
        }));

      // Build flat roles + primary ministry_id for backward compat
      const allRoles = builtMinistries.flatMap((m) => m.roles);
      const primaryMinistryId = builtMinistries[0]?.ministry_id || "";

      const data = {
        name,
        church_id: churchId,
        ministry_id: primaryMinistryId,
        recurrence,
        day_of_week: Number(dayOfWeek),
        start_time: allDay ? "00:00" : startTime,
        end_time: allDay ? null : (endTime || null),
        all_day: allDay,
        duration_minutes: Number(durationMinutes),
        roles: allRoles,
        ministries: builtMinistries,
        ...(editingId ? {} : { created_at: new Date().toISOString() }),
      };

      if (editingId) {
        await updateChurchDocument(churchId, "services", editingId, data);
        setServices((prev) =>
          prev.map((s) => (s.id === editingId ? { ...s, ...data } : s)),
        );
      } else {
        const ref = await addChurchDocument(churchId, "services", data);
        setServices((prev) => [...prev, { id: ref.id, ...data } as Service]);
      }
      resetForm();
      setMutationError("");
    } catch {
      setMutationError("Failed to save service. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!churchId) return;
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 4000);
      return;
    }
    setConfirmDeleteId(null);
    setDeleting(id);
    try {
      await removeChurchDocument(churchId, "services", id);
      setServices((prev) => prev.filter((s) => s.id !== id));
      setMutationError("");
    } catch {
      setMutationError("Failed to delete service. Please try again.");
    } finally {
      setDeleting(null);
    }
  }

  function getMinistryName(id: string) {
    return ministries.find((m) => m.id === id)?.name || "\u2014";
  }

  function getMinistryColor(id: string) {
    return ministries.find((m) => m.id === id)?.color || "#9A9BB5";
  }

  function getDayName(day: number) {
    return DAYS.find((d) => d.value === String(day))?.label || "\u2014";
  }

  function getServiceMinistryNames(s: Service): string {
    if (s.ministries && s.ministries.length > 0) {
      return s.ministries.map((m) => getMinistryName(m.ministry_id)).join(", ");
    }
    return getMinistryName(s.ministry_id);
  }

  function getServiceAllRoles(s: Service): { role: ServiceRole; ministryName: string; ministryColor: string }[] {
    if (s.ministries && s.ministries.length > 0) {
      return s.ministries.flatMap((m) =>
        m.roles.map((r) => ({
          role: r,
          ministryName: getMinistryName(m.ministry_id),
          ministryColor: getMinistryColor(m.ministry_id),
        })),
      );
    }
    return s.roles.map((r) => ({
      role: r,
      ministryName: getMinistryName(s.ministry_id),
      ministryColor: getMinistryColor(s.ministry_id),
    }));
  }

  const isLoading = loading || ministriesLoading;
  const usedMinistryIds = formMinistries.map((m) => m.ministry_id).filter(Boolean);

  return (
    <div>
      {mutationError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {mutationError}
        </div>
      )}
      {!showForm && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setShowForm(true)}>Add Service</Button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="mb-8 max-w-3xl rounded-xl border border-vc-border-light bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-vc-indigo">
            {editingId ? "Edit Service" : "New Service"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Service Name"
              required
              placeholder="e.g., Sunday Morning Worship"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="Day"
                options={DAYS}
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
              />
              <Select
                label="Recurrence"
                options={RECURRENCE_OPTIONS}
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as RecurrencePattern)}
              />
              <div className="flex items-end">
                <label className="flex items-center gap-2 rounded-lg border border-vc-border px-3 py-2.5 text-sm cursor-pointer hover:bg-vc-bg-warm transition-colors">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                    className="h-4 w-4 rounded border-vc-border text-vc-coral focus:ring-vc-coral/30"
                  />
                  <span className="text-vc-text">All day</span>
                </label>
              </div>
            </div>

            {!allDay && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Default Start Time"
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
                <Input
                  label="Default End Time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            )}

            <p className="text-xs text-vc-text-muted -mt-2">
              {allDay
                ? "No specific times \u2014 each ministry can set its own time window below."
                : "Default times for the service. Each ministry can override these below."}
            </p>

            {/* Ministry sections */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="text-sm font-semibold text-vc-indigo">
                  Ministries & Roles
                </label>
                {ministries.length > formMinistries.length && (
                  <button
                    type="button"
                    onClick={addMinistrySection}
                    className="text-sm font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
                  >
                    + Add ministry
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {formMinistries.map((fm) => {
                  const availableMinistries = ministries.filter(
                    (m) => m.id === fm.ministry_id || !usedMinistryIds.includes(m.id),
                  );

                  return (
                    <div
                      key={fm.id}
                      className="rounded-xl border border-vc-border-light bg-vc-bg/30 p-4"
                      style={fm.ministry_id ? { borderLeftWidth: 4, borderLeftColor: getMinistryColor(fm.ministry_id) } : undefined}
                    >
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <select
                          required
                          className="min-w-0 flex-1 max-w-xs rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                          value={fm.ministry_id}
                          onChange={(e) => updateMinistryField(fm.id, "ministry_id", e.target.value)}
                        >
                          <option value="">Select ministry...</option>
                          {availableMinistries.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>

                        {/* Per-ministry time override toggle */}
                        {(fm.start_time || fm.end_time) ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="time"
                              className="rounded-md border border-vc-border bg-white px-2 py-1.5 text-xs text-vc-text focus:border-vc-coral focus:outline-none"
                              value={fm.start_time || ""}
                              onChange={(e) => updateMinistryField(fm.id, "start_time", e.target.value || null)}
                            />
                            <span className="text-xs text-vc-text-muted">–</span>
                            <input
                              type="time"
                              className="rounded-md border border-vc-border bg-white px-2 py-1.5 text-xs text-vc-text focus:border-vc-coral focus:outline-none"
                              value={fm.end_time || ""}
                              onChange={(e) => updateMinistryField(fm.id, "end_time", e.target.value || null)}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                updateMinistryField(fm.id, "start_time", null);
                                updateMinistryField(fm.id, "end_time", null);
                              }}
                              className="ml-1 text-xs text-vc-text-muted hover:text-vc-danger"
                              title="Use service default time"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : !allDay ? (
                          <button
                            type="button"
                            onClick={() => {
                              updateMinistryField(fm.id, "start_time", startTime);
                              updateMinistryField(fm.id, "end_time", endTime);
                            }}
                            className="text-xs text-vc-text-muted hover:text-vc-coral transition-colors whitespace-nowrap"
                          >
                            Custom time
                          </button>
                        ) : null}

                        {formMinistries.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMinistrySection(fm.id)}
                            className="p-1 text-vc-text-muted hover:text-vc-danger transition-colors"
                            title="Remove ministry"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Roles for this ministry */}
                      <div className="space-y-2">
                        {fm.roles.map((role, ri) => (
                          <div key={role.role_id} className="flex items-center gap-2">
                            <input
                              className="min-w-0 flex-1 max-w-sm rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                              placeholder="Role title (e.g., Producer, Camera)"
                              value={role.title}
                              onChange={(e) => updateRoleInMinistry(fm.id, ri, "title", e.target.value)}
                            />
                            <input
                              type="number"
                              min={1}
                              className="w-20 rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                              placeholder="Qty"
                              value={role.count}
                              onChange={(e) => updateRoleInMinistry(fm.id, ri, "count", Number(e.target.value))}
                            />
                            {fm.roles.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeRoleFromMinistry(fm.id, ri)}
                                className="p-1 text-vc-text-muted hover:text-vc-danger transition-colors"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                        {svcTierWarning && (
                          <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">{svcTierWarning}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => addRoleToMinistry(fm.id)}
                          disabled={!!svcTierWarning}
                          className={`text-xs font-medium transition-colors ${svcTierWarning ? "text-vc-text-muted cursor-not-allowed" : "text-vc-coral hover:text-vc-coral-dark"}`}
                        >
                          + Add role
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={saving}>
                {editingId ? "Save Changes" : "Create Service"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Service list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : services.length === 0 && !showForm ? (
        <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
          <svg className="mx-auto h-8 w-8 text-vc-text-muted/50" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <p className="mt-3 text-vc-text-secondary">No services configured.</p>
          <p className="mt-1 text-sm text-vc-text-muted">
            {ministries.length === 0
              ? "Add ministries first, then configure services."
              : "Add a service to define when and where volunteers are needed."}
          </p>
        </div>
      ) : (
        <div className="max-w-3xl space-y-3">
          {services.map((s) => {
            const serviceRoles = getServiceAllRoles(s);
            const hasMultiMinistry = s.ministries && s.ministries.length > 1;

            return (
              <div
                key={s.id}
                className="rounded-xl border border-vc-border-light bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-vc-indigo">{s.name}</h3>
                    <p className="mt-1 text-sm text-vc-text-muted">
                      {getDayName(s.day_of_week)}{s.all_day ? " · All day" : ` · ${s.start_time}${s.end_time ? `–${s.end_time}` : ` · ${s.duration_minutes} min`}`} · {getServiceMinistryNames(s)}
                    </p>
                  </div>
                  <span className="rounded-full bg-vc-bg-warm px-3 py-1 text-xs font-medium text-vc-text-secondary capitalize">
                    {s.recurrence}
                  </span>
                </div>

                {/* Show ministry-grouped roles for multi-ministry services */}
                {hasMultiMinistry ? (
                  <div className="mt-3 space-y-2">
                    {s.ministries!.map((sm) => (
                      <div key={sm.ministry_id} className="flex items-center gap-2 flex-wrap">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: getMinistryColor(sm.ministry_id) }}
                        >
                          {getMinistryName(sm.ministry_id)}
                          {sm.start_time && (
                            <span className="opacity-80 ml-1">{sm.start_time}{sm.end_time ? `–${sm.end_time}` : ""}</span>
                          )}
                        </span>
                        {sm.roles.map((r) => (
                          <span key={r.role_id} className="rounded-lg bg-vc-indigo/5 px-2.5 py-0.5 text-xs font-medium text-vc-indigo">
                            {r.title} ×{r.count}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : serviceRoles.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {serviceRoles.map(({ role: r }) => {
                      const hasCustomTime = r.start_time || r.end_time;
                      const timeStr = hasCustomTime ? ` (${r.start_time || "?"}–${r.end_time || "?"})` : "";
                      return (
                        <span key={r.role_id} className="rounded-lg bg-vc-indigo/5 px-2.5 py-1 text-xs font-medium text-vc-indigo">
                          {r.title} ×{r.count}{timeStr}
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                {/* Actions — always visible */}
                <div className="mt-3 flex items-center gap-1 border-t border-vc-border-light pt-3">
                  <button
                    onClick={() => startEdit(s)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-vc-text-secondary hover:bg-vc-bg-warm hover:text-vc-indigo transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                    </svg>
                    Edit
                  </button>
                  <div className="ml-auto">
                    <button
                      onClick={() => handleDelete(s.id)}
                      disabled={deleting === s.id}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        confirmDeleteId === s.id
                          ? "bg-vc-danger/10 text-vc-danger"
                          : "text-vc-text-muted hover:bg-vc-danger/5 hover:text-vc-danger"
                      }`}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                      {deleting === s.id ? "Deleting..." : confirmDeleteId === s.id ? "Confirm delete" : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// EVENTS TAB
// ===========================================================================

function EventsTab({
  churchId,
  churchName,
  churchTier,
  user,
  activeMembership,
  ministries,
  loading: ministriesLoading,
}: {
  churchId: string | undefined;
  churchName: string;
  churchTier: string;
  user: ReturnType<typeof useAuth>["user"];
  activeMembership: ReturnType<typeof useAuth>["activeMembership"];
  ministries: Ministry[];
  loading: boolean;
}) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [signupCounts, setSignupCounts] = useState<Record<string, number>>({});
  const [shortLinkEventId, setShortLinkEventId] = useState<string | null>(null);
  const [emailInviteEventId, setEmailInviteEventId] = useState<string | null>(null);
  const [rosterEvent, setRosterEvent] = useState<Event | null>(null);
  const [mutationError, setMutationError] = useState("");
  const userIsAdmin = isAdmin(activeMembership);
  const userCanMarkAttendance = isScheduler(activeMembership);
  // Short link lookup: targetPath → full short link URL
  const [shortLinkMap, setShortLinkMap] = useState<Record<string, string>>({});

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState<EventType>("one_time");
  const [visibility, setVisibility] = useState<EventVisibility>("internal");
  const [signupMode, setSignupMode] = useState<SignupMode>("open");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [allDay, setAllDay] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrencePattern>("weekly");
  const [dayOfWeek, setDayOfWeek] = useState("0");
  const [ministryIds, setMinistryIds] = useState<string[]>([]);
  const [roles, setRoles] = useState<RoleSlot[]>([
    { role_id: crypto.randomUUID(), title: "", count: 1, ministry_id: null, allow_signup: true, start_time: null, end_time: null },
  ]);

  useEffect(() => {
    if (!churchId) return;
    async function load() {
      try {
        const evts = await getChurchDocuments(churchId!, "events");
        const typedEvents = evts as unknown as Event[];
        setEvents(typedEvents);

        // Load signup counts + short links in parallel
        const openEvents = typedEvents.filter((e) => e.signup_mode !== "scheduled");
        const openIds = openEvents.map((e) => e.id);

        const [allSignups, shortLinksResult] = await Promise.all([
          openIds.length > 0
            ? getEventSignupsBatch(openIds, churchId!)
            : Promise.resolve([]),
          user
            ? user.getIdToken().then(async (token) => {
                const res = await fetch(`/api/short-links?church_id=${churchId}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) return res.json();
                return null;
              }).catch(() => null)
            : Promise.resolve(null),
        ]);

        const counts: Record<string, number> = {};
        for (const s of allSignups) {
          if (s.status !== "cancelled") {
            counts[s.event_id] = (counts[s.event_id] || 0) + 1;
          }
        }
        setSignupCounts(counts);

        if (shortLinksResult) {
          const map: Record<string, string> = {};
          for (const link of shortLinksResult.links || []) {
            if (link.target_url) {
              map[link.target_url] = `${window.location.origin}/s/${link.slug}`;
            }
          }
          setShortLinkMap(map);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId, user]);

  function resetForm() {
    setName("");
    setDescription("");
    setEventType("one_time");
    setVisibility("internal");
    setSignupMode("open");
    setDate("");
    setStartTime("09:00");
    setEndTime("17:00");
    setAllDay(false);
    setRecurrence("weekly");
    setDayOfWeek("0");
    setMinistryIds([]);
    setRoles([
      { role_id: crypto.randomUUID(), title: "", count: 1, ministry_id: null, allow_signup: true, start_time: null, end_time: null },
    ]);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(e: Event) {
    setName(e.name);
    setDescription(e.description);
    setEventType(e.event_type);
    setVisibility(e.visibility);
    setSignupMode(e.signup_mode);
    setDate(e.date);
    setStartTime(e.start_time || "09:00");
    setEndTime(e.end_time || "17:00");
    setAllDay(e.all_day);
    setRecurrence(e.recurrence || "weekly");
    setDayOfWeek(String(e.day_of_week ?? 0));
    setMinistryIds(e.ministry_ids);
    setRoles(
      e.roles.length > 0
        ? e.roles
        : [{ role_id: crypto.randomUUID(), title: "", count: 1, ministry_id: null, allow_signup: true, start_time: null, end_time: null }],
    );
    setEditingId(e.id);
    setShowForm(true);
  }

  const tierLimits = TIER_LIMITS[churchTier] || TIER_LIMITS.free;
  const [tierWarning, setTierWarning] = useState("");

  function addRole() {
    const limit = tierLimits.roles_per_event;
    if (roles.length >= limit) {
      setTierWarning(`Your ${churchTier === "free" ? "Free" : churchTier} plan allows up to ${limit} roles per event. Upgrade to add more.`);
      return;
    }
    setTierWarning("");
    setRoles((prev) => [
      ...prev,
      { role_id: crypto.randomUUID(), title: "", count: 1, ministry_id: null, allow_signup: true, start_time: null, end_time: null },
    ]);
  }

  function updateRole(index: number, field: string, value: string | number | boolean | null) {
    setRoles((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    );
  }

  function removeRole(index: number) {
    setRoles((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleMinistry(id: string) {
    setMinistryIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!churchId || !user) return;
    setSaving(true);

    try {
      const filteredRoles = roles.filter((r) => r.title.trim());
      const signupUrl = visibility === "public" ? `${window.location.origin}/events/{id}/signup` : null;

      const data = {
        name,
        description,
        church_id: churchId,
        event_type: eventType,
        visibility,
        signup_mode: signupMode,
        date,
        start_time: allDay ? null : startTime,
        end_time: allDay ? null : (endTime || null),
        all_day: allDay,
        duration_minutes: 0,
        recurrence: eventType === "recurring" ? recurrence : null,
        day_of_week: eventType === "recurring" ? Number(dayOfWeek) : null,
        roles: filteredRoles,
        ministry_ids: ministryIds,
        promotion: {
          send_email_blast: false,
          send_sms_blast: false,
          qr_code_url: null,
          signup_url: signupUrl,
        },
        ...(editingId ? {} : { created_by: user.uid, created_at: new Date().toISOString() }),
      };

      if (editingId) {
        await updateChurchDocument(churchId, "events", editingId, data);
        setEvents((prev) =>
          prev.map((ev) => (ev.id === editingId ? { ...ev, ...data } : ev)),
        );
      } else {
        const ref = await addChurchDocument(churchId, "events", data);
        const newEvent = { id: ref.id, ...data } as Event;
        if (visibility === "public") {
          const realUrl = `${window.location.origin}/events/${churchId}/${ref.id}/signup`;
          await updateChurchDocument(churchId, "events", ref.id, {
            promotion: { ...data.promotion, signup_url: realUrl },
          });
          newEvent.promotion.signup_url = realUrl;
        }
        setEvents((prev) => [...prev, newEvent]);
      }
      resetForm();
      setMutationError("");
    } catch {
      setMutationError("Failed to save event. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!churchId) return;
    setDeleting(id);
    try {
      await removeChurchDocument(churchId, "events", id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
      setMutationError("");
    } catch {
      setMutationError("Failed to delete event. Please try again.");
    } finally {
      setDeleting(null);
    }
  }

  const [copiedEventId, setCopiedEventId] = useState<string | null>(null);

  async function printEventInvite(ev: Event) {
    const { printFlyer } = await import("@/lib/utils/print-flyer");
    const signupUrl = `${window.location.origin}/events/${churchId}/${ev.id}/signup`;
    const dateDisplay = formatEventDate(ev.date || "");
    const timeStr = ev.start_time ? ` at ${formatEventTime(ev.start_time)}` : "";
    const totalSlots = ev.roles.reduce((sum, r) => sum + r.count, 0);
    printFlyer({
      title: ev.name,
      subtitle: ev.all_day
        ? `${dateDisplay} — All Day`
        : `${dateDisplay}${timeStr}`,
      orgName: churchName,
      url: signupUrl,
      stats: totalSlots > 0 ? `${ev.roles.length} role${ev.roles.length !== 1 ? "s" : ""} · ${totalSlots} volunteer${totalSlots !== 1 ? "s" : ""} needed` : undefined,
      instructions: [
        "Scan the QR code with your phone camera",
        "Choose a volunteer role",
        "Sign up — new volunteers will need to create an account",
      ],
    });
  }

  async function downloadEventSlide(ev: Event) {
    const { downloadSlide } = await import("@/lib/utils/download-slide");
    const signupUrl = `${window.location.origin}/events/${churchId}/${ev.id}/signup`;
    const slideDateDisplay = formatEventDate(ev.date || "");
    const slideTimeStr = ev.start_time ? ` at ${formatEventTime(ev.start_time)}` : "";
    const slideTotalSlots = ev.roles.reduce((sum, r) => sum + r.count, 0);
    downloadSlide({
      title: ev.name,
      subtitle: ev.all_day
        ? `${slideDateDisplay} — All Day`
        : `${slideDateDisplay}${slideTimeStr}`,
      orgName: churchName,
      url: signupUrl,
      stats: slideTotalSlots > 0 ? `${ev.roles.length} role${ev.roles.length !== 1 ? "s" : ""} · ${slideTotalSlots} volunteer${slideTotalSlots !== 1 ? "s" : ""} needed` : undefined,
      instructions: [
        "Scan the QR code with your phone camera",
        "Choose a volunteer role",
        "Sign up — we'll confirm your spot!",
      ],
    });
  }

  function formatEventTime(t: string) {
    const [h, m] = t.split(":");
    const hour = Number(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${h12}:${m} ${ampm}`;
  }

  function formatEventDate(dateStr: string): string {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T12:00:00");
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
    const month = d.toLocaleDateString("en-US", { month: "long" });
    const day = d.getDate();
    const suffix = day === 11 || day === 12 || day === 13 ? "th"
      : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
    return `${weekday}, ${month} ${day}${suffix}`;
  }

  function getEventShortLink(eventId: string): string | undefined {
    const targetPath = `/events/${churchId}/${eventId}/signup`;
    return shortLinkMap[targetPath];
  }

  function copySignupLink(eventId: string) {
    const url = `${window.location.origin}/events/${churchId}/${eventId}/signup`;
    navigator.clipboard.writeText(url);
    setCopiedEventId(eventId);
    setTimeout(() => setCopiedEventId(null), 2000);
  }

  function copyShortLink(eventId: string) {
    const shortUrl = getEventShortLink(eventId);
    if (shortUrl) {
      navigator.clipboard.writeText(shortUrl);
      setCopiedEventId(eventId);
      setTimeout(() => setCopiedEventId(null), 2000);
    }
  }

  function getMinistryNames(ids: string[]) {
    if (ids.length === 0) return "All ministries";
    return ids.map((id) => ministries.find((m) => m.id === id)?.name || id).join(", ");
  }

  function formatTime(t: string | null) {
    if (!t) return "";
    const [h, m] = t.split(":");
    const hour = Number(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${h12}:${m} ${ampm}`;
  }

  const upcomingEvents = events
    .filter((e) => e.date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date));
  const pastEvents = events
    .filter((e) => e.date < new Date().toISOString().slice(0, 10))
    .sort((a, b) => b.date.localeCompare(a.date));

  const isLoading = loading || ministriesLoading;

  return (
    <div>
      {mutationError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {mutationError}
        </div>
      )}
      {!showForm && (
        <div className="mb-4 flex items-center justify-end gap-3">
          {!editingId && events.length >= tierLimits.active_events && (
            <p className="text-xs text-vc-danger">
              {churchTier === "free" ? "Free" : churchTier} plan limit: {tierLimits.active_events} event{tierLimits.active_events !== 1 ? "s" : ""}.{" "}
              <a href="/dashboard/organization" className="underline hover:text-vc-indigo">Upgrade</a>
            </p>
          )}
          <Button
            onClick={() => setShowForm(true)}
            disabled={!editingId && events.length >= tierLimits.active_events}
          >
            Create Event
          </Button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="mb-8 max-w-3xl rounded-xl border border-vc-border-light bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-vc-indigo">
            {editingId ? "Edit Event" : "New Event"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Event Name"
                required
                placeholder="e.g., Easter Sunday Setup"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Select
                label="Event Type"
                options={EVENT_TYPE_OPTIONS}
                value={eventType}
                onChange={(e) => setEventType(e.target.value as EventType)}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-vc-text">Description</label>
              <textarea
                className="mt-1.5 w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-base text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                rows={3}
                placeholder="What's this event about? Volunteers will see this description."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="Signup Mode"
                options={SIGNUP_MODES}
                value={signupMode}
                onChange={(e) => setSignupMode(e.target.value as SignupMode)}
              />
              <Select
                label="Visibility"
                options={VISIBILITY_OPTIONS}
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as EventVisibility)}
              />
              <div className="flex items-end">
                <label className="flex items-center gap-2 rounded-lg border border-vc-border px-3 py-2.5 text-sm cursor-pointer hover:bg-vc-bg-warm transition-colors">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                    className="h-4 w-4 rounded border-vc-border text-vc-coral focus:ring-vc-coral/30"
                  />
                  <span className="text-vc-text">All day</span>
                </label>
              </div>
            </div>

            {eventType === "one_time" ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  label="Date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                {!allDay && (
                  <>
                    <Input
                      label="Start Time"
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                    <Input
                      label="End Time"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <Select
                  label="Day"
                  options={DAYS}
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(e.target.value)}
                />
                <Select
                  label="Recurrence"
                  options={EVENT_RECURRENCE_OPTIONS}
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value as RecurrencePattern)}
                />
                <Input
                  label="Start Date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            )}

            {!allDay && eventType === "recurring" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Start Time"
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
                <Input
                  label="End Time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            )}

            {/* Ministry tags */}
            {ministries.length > 0 && (
              <div>
                <label className="text-sm font-medium text-vc-text">
                  Ministries involved
                </label>
                <p className="mb-2 text-xs text-vc-text-muted">
                  Select which ministries this event spans. Leave empty for org-wide.
                </p>
                <div className="flex flex-wrap gap-2">
                  {ministries.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMinistry(m.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        ministryIds.includes(m.id)
                          ? "bg-vc-coral text-white"
                          : "bg-vc-bg-warm text-vc-text-secondary hover:bg-vc-sand/30"
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Roles */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-vc-text">
                  Roles / Positions Needed
                </label>
                <button
                  type="button"
                  onClick={addRole}
                  className="text-sm font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
                >
                  + Add role
                </button>
                {tierWarning && (
                  <p className="text-xs text-vc-danger">
                    {tierWarning}{" "}
                    <a href="/dashboard/organization" className="underline hover:text-vc-indigo">View plans</a>
                  </p>
                )}
              </div>
              <div className="space-y-3">
                {roles.map((role, i) => (
                  <div key={role.role_id} className="rounded-lg border border-vc-border-light bg-vc-bg/50 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        className="min-w-0 flex-1 max-w-sm rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                        placeholder="Role title (e.g., Setup Crew, Greeter, Parking)"
                        value={role.title}
                        onChange={(e) => updateRole(i, "title", e.target.value)}
                      />
                      <input
                        type="number"
                        min={1}
                        className="w-20 rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                        placeholder="Qty"
                        value={role.count}
                        onChange={(e) => updateRole(i, "count", Number(e.target.value))}
                      />
                      {roles.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRole(i)}
                          className="p-1 text-vc-text-muted hover:text-vc-danger transition-colors"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Role options row */}
                    {role.title.trim() && (<>
                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        <label className="flex items-center gap-1.5 text-xs text-vc-text-secondary cursor-pointer">
                          <input
                            type="checkbox"
                            checked={role.allow_signup}
                            onChange={(e) => updateRole(i, "allow_signup", e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-vc-border text-vc-coral focus:ring-vc-coral/30"
                          />
                          Open for signup
                        </label>

                        {ministries.length > 0 && (
                          <select
                            className="rounded-md border border-vc-border bg-white px-2 py-1 text-xs text-vc-text focus:border-vc-coral focus:outline-none"
                            value={role.ministry_id || ""}
                            onChange={(e) => updateRole(i, "ministry_id", e.target.value || null)}
                          >
                            <option value="">General (no ministry)</option>
                            {ministries.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Per-role time override — separate row for mobile */}
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap ml-0 sm:ml-5">
                        <span className="text-xs text-vc-text-muted shrink-0">Times:</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            className="rounded-md border border-vc-border bg-white px-2 py-1 text-xs text-vc-text focus:border-vc-coral focus:outline-none focus:ring-1 focus:ring-vc-coral/20"
                            value={role.start_time || ""}
                            placeholder={startTime}
                            onFocus={(e) => { if (!e.target.value) updateRole(i, "start_time", startTime); }}
                            onChange={(e) => updateRole(i, "start_time", e.target.value || null)}
                          />
                          <span className="text-xs text-vc-text-muted">to</span>
                          <input
                            type="time"
                            className="rounded-md border border-vc-border bg-white px-2 py-1 text-xs text-vc-text focus:border-vc-coral focus:outline-none focus:ring-1 focus:ring-vc-coral/20"
                            value={role.end_time || ""}
                            placeholder={endTime}
                            onFocus={(e) => { if (!e.target.value) updateRole(i, "end_time", endTime); }}
                            onChange={(e) => updateRole(i, "end_time", e.target.value || null)}
                          />
                          {(role.start_time || role.end_time) && (
                            <button
                              type="button"
                              onClick={() => {
                                updateRole(i, "start_time", null);
                                updateRole(i, "end_time", null);
                              }}
                              className="text-xs text-vc-text-muted hover:text-vc-danger transition-colors"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        {!role.start_time && !role.end_time && (
                          <span className="text-xs text-vc-text-muted italic">
                            {allDay ? "No times set" : "Using event default"}
                          </span>
                        )}
                      </div>
                    </>)}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" loading={saving}>
                {editingId ? "Save Changes" : "Create Event"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Event list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : events.length === 0 && !showForm ? (
        <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
          <svg className="mx-auto h-8 w-8 text-vc-text-muted/50" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
          <p className="mt-3 text-vc-text-secondary">No events yet.</p>
          <p className="mt-1 text-sm text-vc-text-muted">
            Create an event to let volunteers sign up for roles.
          </p>
        </div>
      ) : (
        <div className="max-w-3xl space-y-6">
          {/* Upcoming */}
          {upcomingEvents.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-vc-text-muted">
                Upcoming
              </h2>
              <div className="space-y-3">
                {upcomingEvents.map((ev) => (
                  <div key={ev.id}>
                    <EventCard
                      event={ev}
                      signupCount={signupCounts[ev.id] || 0}
                      onEdit={() => startEdit(ev)}
                      onDelete={() => handleDelete(ev.id)}
                      onCopyLink={() => copySignupLink(ev.id)}
                      onPrintInvite={() => printEventInvite(ev)}
                      onDownloadSlide={() => downloadEventSlide(ev)}
                      onCreateShortLink={userIsAdmin ? () => setShortLinkEventId(ev.id) : undefined}
                      onEmailInvite={userIsAdmin ? () => setEmailInviteEventId(ev.id) : undefined}
                      onViewRoster={() => setRosterEvent(ev)}
                      deleting={deleting === ev.id}
                      copied={copiedEventId === ev.id}
                      getMinistryNames={getMinistryNames}
                      formatTime={formatTime}
                      formatDate={formatEventDate}
                      hasShortLink={!!getEventShortLink(ev.id)}
                      shortLinkUrl={getEventShortLink(ev.id)}
                      onCopyShortLink={() => copyShortLink(ev.id)}
                    />
                    {shortLinkEventId === ev.id && churchId && (
                      <div className="mt-2 ml-4">
                        <ShortLinkCreator
                          churchId={churchId}
                          targetUrl={`/events/${churchId}/${ev.id}/signup`}
                          label={`Event signup — ${ev.name}`}
                          tier={churchTier}
                          onClose={() => setShortLinkEventId(null)}
                        />
                      </div>
                    )}
                    {emailInviteEventId === ev.id && churchId && (
                      <div className="mt-2 ml-4">
                        <EventEmailInvite
                          churchId={churchId}
                          eventId={ev.id}
                          eventName={ev.name}
                          onClose={() => setEmailInviteEventId(null)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Past */}
          {pastEvents.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-vc-text-muted">
                Past
              </h2>
              <div className="space-y-3">
                {pastEvents.map((ev) => (
                  <div key={ev.id}>
                    <EventCard
                      event={ev}
                      signupCount={signupCounts[ev.id] || 0}
                      onEdit={() => startEdit(ev)}
                      onDelete={() => handleDelete(ev.id)}
                      onCopyLink={() => copySignupLink(ev.id)}
                      onPrintInvite={() => printEventInvite(ev)}
                      onDownloadSlide={() => downloadEventSlide(ev)}
                      onCreateShortLink={userIsAdmin ? () => setShortLinkEventId(ev.id) : undefined}
                      onEmailInvite={userIsAdmin ? () => setEmailInviteEventId(ev.id) : undefined}
                      deleting={deleting === ev.id}
                      copied={copiedEventId === ev.id}
                      getMinistryNames={getMinistryNames}
                      formatTime={formatTime}
                      formatDate={formatEventDate}
                      isPast
                      hasShortLink={!!getEventShortLink(ev.id)}
                      shortLinkUrl={getEventShortLink(ev.id)}
                      onCopyShortLink={() => copyShortLink(ev.id)}
                    />
                    {shortLinkEventId === ev.id && churchId && (
                      <div className="mt-2 ml-4">
                        <ShortLinkCreator
                          churchId={churchId}
                          targetUrl={`/events/${churchId}/${ev.id}/signup`}
                          label={`Event signup — ${ev.name}`}
                          tier={churchTier}
                          onClose={() => setShortLinkEventId(null)}
                        />
                      </div>
                    )}
                    {emailInviteEventId === ev.id && churchId && (
                      <div className="mt-2 ml-4">
                        <EventEmailInvite
                          churchId={churchId}
                          eventId={ev.id}
                          eventName={ev.name}
                          onClose={() => setEmailInviteEventId(null)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Event Roster Modal */}
      {rosterEvent && churchId && (
        <EventRoster
          event={rosterEvent}
          churchId={churchId}
          open={!!rosterEvent}
          onClose={() => setRosterEvent(null)}
          canMarkAttendance={userCanMarkAttendance}
          activeMembership={activeMembership}
          orgName={churchName}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Card
// ---------------------------------------------------------------------------

function EventCard({
  event: ev,
  signupCount,
  onEdit,
  onDelete,
  onCopyLink,
  onPrintInvite,
  onDownloadSlide,
  onCreateShortLink,
  onEmailInvite,
  onViewRoster,
  deleting,
  copied,
  getMinistryNames,
  formatTime,
  formatDate,
  isPast,
  hasShortLink,
  shortLinkUrl,
  onCopyShortLink,
}: {
  event: Event;
  signupCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  onPrintInvite: () => void;
  onDownloadSlide: () => void;
  onCreateShortLink?: () => void;
  onEmailInvite?: () => void;
  onViewRoster?: () => void;
  deleting: boolean;
  copied: boolean;
  getMinistryNames: (ids: string[]) => string;
  formatTime: (t: string | null) => string;
  formatDate?: (d: string) => string;
  isPast?: boolean;
  hasShortLink?: boolean;
  shortLinkUrl?: string;
  onCopyShortLink?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const totalSlots = ev.roles.reduce((sum, r) => sum + r.count, 0);
  const hasSignupLink = ev.signup_mode !== "scheduled" || ev.visibility === "public";

  function handleDeleteClick() {
    if (confirmDelete) {
      onDelete();
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
    }
  }

  return (
    <div
      className={`rounded-xl border border-vc-border-light bg-white p-5 transition-shadow hover:shadow-md ${
        isPast ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-vc-indigo">{ev.name}</h3>
            {ev.signup_mode !== "scheduled" && (
              <span className="rounded-full bg-vc-sage/15 px-2 py-0.5 text-xs font-medium text-vc-sage">
                Open signup
              </span>
            )}
            {ev.visibility === "public" && (
              <span className="rounded-full bg-vc-coral/10 px-2 py-0.5 text-xs font-medium text-vc-coral">
                Public
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-vc-text-muted">
            {formatDate ? formatDate(ev.date) : ev.date}
            {ev.all_day
              ? " · All day"
              : ev.start_time
                ? ` · ${formatTime(ev.start_time)}${ev.end_time ? `–${formatTime(ev.end_time)}` : ""}`
                : ""}
            {ev.event_type === "recurring" && ` · ${ev.recurrence}`}
            {" · "}
            {getMinistryNames(ev.ministry_ids)}
          </p>
          {ev.description && (
            <p className="mt-1 text-sm text-vc-text-secondary line-clamp-2">
              {ev.description}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="rounded-full bg-vc-bg-warm px-3 py-1 text-xs font-medium text-vc-text-secondary capitalize">
            {ev.event_type === "recurring" ? ev.recurrence : "one-time"}
          </span>
          {ev.signup_mode !== "scheduled" && totalSlots > 0 && (
            <button
              onClick={onViewRoster}
              className="text-xs text-vc-text-muted underline decoration-dotted hover:text-vc-indigo transition-colors"
            >
              {signupCount}/{totalSlots} signed up
            </button>
          )}
        </div>
      </div>

      {/* Roles */}
      {ev.roles.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ev.roles.map((r) => {
            const hasCustomTime = r.start_time || r.end_time;
            const timeStr = hasCustomTime
              ? ` (${formatTime(r.start_time)}–${formatTime(r.end_time)})`
              : "";
            return (
              <span
                key={r.role_id}
                className="rounded-lg bg-vc-indigo/5 px-2.5 py-1 text-xs font-medium text-vc-indigo"
              >
                {r.title} ×{r.count}
                {timeStr}
                {r.allow_signup && (
                  <span className="ml-1 text-vc-sage" title="Open for signup">{"\u25cf"}</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Actions — always visible */}
      <div className="mt-3 flex items-center gap-1 border-t border-vc-border-light pt-3">
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-vc-text-secondary hover:bg-vc-bg-warm hover:text-vc-indigo transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
          </svg>
          Edit
        </button>

        {onViewRoster && (
          <button
            onClick={onViewRoster}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-vc-text-secondary hover:bg-vc-bg-warm hover:text-vc-indigo transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
            </svg>
            Roster
          </button>
        )}

        {hasSignupLink && (
          <ShareMenu
            onCopyLink={onCopyLink}
            onPrintInvite={onPrintInvite}
            onDownloadSlide={onDownloadSlide}
            onCreateShortLink={onCreateShortLink}
            onEmailInvite={onEmailInvite}
            copied={copied}
            hasShortLink={hasShortLink}
            shortLinkUrl={shortLinkUrl}
            onCopyShortLink={onCopyShortLink}
          />
        )}

        <div className="ml-auto">
          <button
            onClick={handleDeleteClick}
            disabled={deleting}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              confirmDelete
                ? "bg-vc-danger/10 text-vc-danger"
                : "text-vc-text-muted hover:bg-vc-danger/5 hover:text-vc-danger"
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
            {deleting ? "Deleting..." : confirmDelete ? "Confirm delete" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Email Invite (inline compose)
// ---------------------------------------------------------------------------

function EventEmailInvite({
  churchId,
  eventId,
  eventName,
  onClose,
}: {
  churchId: string;
  eventId: string;
  eventName: string;
  onClose: () => void;
}) {
  const [emails, setEmails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  async function handleSend() {
    const recipientList = emails
      .split(/[,\n]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@"));

    if (recipientList.length === 0) {
      setError("Enter at least one valid email address.");
      return;
    }
    if (recipientList.length > 50) {
      setError("Maximum 50 recipients per send.");
      return;
    }

    setSending(true);
    setError("");

    try {
      const token = await getAuth().currentUser?.getIdToken();
      if (!token) {
        setError("Not authenticated");
        return;
      }

      const res = await fetch("/api/event-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          church_id: churchId,
          event_id: eventId,
          recipient_emails: recipientList,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send invites");
        return;
      }

      setResult({ sent: data.sent, failed: data.failed });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-3 rounded-xl border border-vc-sage/30 bg-vc-sage/5 p-4">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          <p className="text-sm font-medium text-vc-sage">
            {result.sent} invite{result.sent !== 1 ? "s" : ""} sent!
          </p>
        </div>
        {result.failed > 0 && (
          <p className="text-xs text-vc-danger">
            {result.failed} email{result.failed !== 1 ? "s" : ""} failed to send.
          </p>
        )}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="text-xs font-medium text-vc-text-secondary hover:text-vc-indigo transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-vc-border-light bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-vc-indigo">
          Email invite — {eventName}
        </p>
        <button
          onClick={onClose}
          className="text-vc-text-muted hover:text-vc-indigo transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div>
        <label className="text-xs font-medium text-vc-text-secondary">
          Recipient emails (comma or newline separated)
        </label>
        <textarea
          autoFocus
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder={"jane@example.com, john@example.com"}
          rows={3}
          className="mt-1 w-full rounded-lg border border-vc-border px-3 py-2 text-sm text-vc-text placeholder:text-vc-text-muted focus:outline-none focus:ring-2 focus:border-vc-coral focus:ring-vc-coral/20 transition-colors"
        />
        <p className="mt-1 text-xs text-vc-text-muted">
          Up to 50 recipients. Each will receive a branded invite with event details and a signup link.
        </p>
      </div>

      {error && <p className="text-xs text-vc-danger">{error}</p>}

      <button
        onClick={handleSend}
        disabled={sending || !emails.trim()}
        className="w-full rounded-lg bg-vc-coral px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-vc-coral/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {sending ? "Sending..." : "Send invites"}
      </button>
    </div>
  );
}
