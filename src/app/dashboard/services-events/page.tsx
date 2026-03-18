"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import {
  addChurchDocument,
  getChurchDocuments,
  updateChurchDocument,
  removeChurchDocument,
  getEventSignups,
} from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
  { value: "scheduled", label: "Scheduled \u2014 admin assigns roles" },
  { value: "hybrid", label: "Hybrid \u2014 admin assigns, volunteers fill remaining" },
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
  const [loading, setLoading] = useState(true);

  // Shared data: ministries
  useEffect(() => {
    if (!churchId) return;
    getChurchDocuments(churchId, "ministries")
      .then((mins) => setMinistries(mins as unknown as Ministry[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [churchId]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
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
        <ServicesTab churchId={churchId} ministries={ministries} loading={loading} />
      ) : (
        <EventsTab churchId={churchId} user={user} ministries={ministries} loading={loading} />
      )}
    </div>
  );
}

// ===========================================================================
// SERVICES TAB
// ===========================================================================

function ServicesTab({
  churchId,
  ministries,
  loading: ministriesLoading,
}: {
  churchId: string | undefined;
  ministries: Ministry[];
  loading: boolean;
}) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [ministryId, setMinistryId] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrencePattern>("weekly");
  const [dayOfWeek, setDayOfWeek] = useState("0");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:30");
  const [allDay, setAllDay] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState("90");
  const [roles, setRoles] = useState<ServiceRole[]>([
    { role_id: crypto.randomUUID(), title: "", count: 1 },
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
    setMinistryId("");
    setRecurrence("weekly");
    setDayOfWeek("0");
    setStartTime("09:00");
    setEndTime("10:30");
    setAllDay(false);
    setDurationMinutes("90");
    setRoles([{ role_id: crypto.randomUUID(), title: "", count: 1 }]);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(s: Service) {
    setName(s.name);
    setMinistryId(s.ministry_id);
    setRecurrence(s.recurrence);
    setDayOfWeek(String(s.day_of_week));
    setStartTime(s.start_time);
    setEndTime(s.end_time || "");
    setAllDay(s.all_day || false);
    setDurationMinutes(String(s.duration_minutes));
    setRoles(s.roles.length > 0 ? s.roles : [{ role_id: crypto.randomUUID(), title: "", count: 1 }]);
    setEditingId(s.id);
    setShowForm(true);
  }

  function addRole() {
    setRoles((prev) => [...prev, { role_id: crypto.randomUUID(), title: "", count: 1 }]);
  }

  function updateRole(index: number, field: string, value: string | number | null) {
    setRoles((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    );
  }

  function removeRole(index: number) {
    setRoles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!churchId) return;
    setSaving(true);

    try {
      const filteredRoles = roles.filter((r) => r.title.trim());
      const data = {
        name,
        church_id: churchId,
        ministry_id: ministryId,
        recurrence,
        day_of_week: Number(dayOfWeek),
        start_time: allDay ? "00:00" : startTime,
        end_time: allDay ? null : (endTime || null),
        all_day: allDay,
        duration_minutes: Number(durationMinutes),
        roles: filteredRoles,
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
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!churchId) return;
    setDeleting(id);
    try {
      await removeChurchDocument(churchId, "services", id);
      setServices((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  }

  function getMinistryName(id: string) {
    return ministries.find((m) => m.id === id)?.name || "\u2014";
  }

  function getDayName(day: number) {
    return DAYS.find((d) => d.value === String(day))?.label || "\u2014";
  }

  const isLoading = loading || ministriesLoading;

  return (
    <div>
      {!showForm && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setShowForm(true)}>Add Service</Button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="mb-8 rounded-xl border border-vc-border-light bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-vc-indigo">
            {editingId ? "Edit Service" : "New Service"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Service Name"
                required
                placeholder="e.g., Sunday Morning Worship"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Select
                label="Ministry"
                required
                placeholder="Select a ministry"
                options={ministries.map((m) => ({ value: m.id, label: m.name }))}
                value={ministryId}
                onChange={(e) => setMinistryId(e.target.value)}
              />
            </div>

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
                ? "No specific times \u2014 roles can still have their own time windows below."
                : "Default times for the service. Individual roles can override these below."}
            </p>

            {/* Roles */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-vc-text">
                  Roles Needed
                </label>
                <button
                  type="button"
                  onClick={addRole}
                  className="text-sm font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
                >
                  + Add role
                </button>
              </div>
              <div className="space-y-3">
                {roles.map((role, i) => (
                  <div key={role.role_id} className="rounded-lg border border-vc-border-light bg-vc-bg/50 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                        placeholder="Role title (e.g., Producer, Editor, Camera)"
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
                    {/* Per-role time override */}
                    {role.title.trim() && (
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-vc-text-muted shrink-0">Custom times:</span>
                        <input
                          type="time"
                          className="rounded-md border border-vc-border bg-white px-2 py-1 text-xs text-vc-text focus:border-vc-coral focus:outline-none focus:ring-1 focus:ring-vc-coral/20"
                          placeholder="Start"
                          value={role.start_time || ""}
                          onChange={(e) => updateRole(i, "start_time", e.target.value || null)}
                        />
                        <span className="text-xs text-vc-text-muted">to</span>
                        <input
                          type="time"
                          className="rounded-md border border-vc-border bg-white px-2 py-1 text-xs text-vc-text focus:border-vc-coral focus:outline-none focus:ring-1 focus:ring-vc-coral/20"
                          placeholder="End"
                          value={role.end_time || ""}
                          onChange={(e) => updateRole(i, "end_time", e.target.value || null)}
                        />
                        {(role.start_time || role.end_time) && (
                          <button
                            type="button"
                            onClick={() => {
                              updateRole(i, "start_time", null as unknown as string);
                              updateRole(i, "end_time", null as unknown as string);
                            }}
                            className="text-xs text-vc-text-muted hover:text-vc-danger transition-colors"
                          >
                            Clear
                          </button>
                        )}
                        {!role.start_time && !role.end_time && (
                          <span className="text-xs text-vc-text-muted italic">
                            {allDay ? "No times set" : "Using service default"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
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
        <div className="py-12 text-center text-vc-text-muted">Loading...</div>
      ) : services.length === 0 && !showForm ? (
        <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
          <p className="text-vc-text-secondary">No services configured.</p>
          <p className="mt-1 text-sm text-vc-text-muted">
            {ministries.length === 0
              ? "Add ministries first, then configure services."
              : "Add a service to define when and where volunteers are needed."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((s) => (
            <div
              key={s.id}
              className="group rounded-xl border border-vc-border-light bg-white p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-vc-indigo">{s.name}</h3>
                  <p className="mt-1 text-sm text-vc-text-muted">
                    {getDayName(s.day_of_week)}{s.all_day ? " \u00b7 All day" : ` \u00b7 ${s.start_time}${s.end_time ? `\u2013${s.end_time}` : ` \u00b7 ${s.duration_minutes} min`}`} \u00b7 {getMinistryName(s.ministry_id)}
                  </p>
                </div>
                <span className="rounded-full bg-vc-bg-warm px-3 py-1 text-xs font-medium text-vc-text-secondary capitalize">
                  {s.recurrence}
                </span>
              </div>
              {s.roles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.roles.map((r) => {
                    const hasCustomTime = r.start_time || r.end_time;
                    const timeStr = hasCustomTime
                      ? ` (${r.start_time || "?"}–${r.end_time || "?"})`
                      : "";
                    return (
                      <span
                        key={r.role_id}
                        className="rounded-lg bg-vc-indigo/5 px-2.5 py-1 text-xs font-medium text-vc-indigo"
                      >
                        {r.title} \u00d7{r.count}{timeStr}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="mt-3 flex gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startEdit(s)}
                  className="text-xs font-medium text-vc-text-secondary hover:text-vc-coral transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  disabled={deleting === s.id}
                  className="text-xs font-medium text-vc-text-muted hover:text-vc-danger transition-colors"
                >
                  {deleting === s.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          ))}
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
  user,
  ministries,
  loading: ministriesLoading,
}: {
  churchId: string | undefined;
  user: ReturnType<typeof useAuth>["user"];
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

        const openEvents = typedEvents.filter((e) => e.signup_mode !== "scheduled");
        const counts: Record<string, number> = {};
        await Promise.all(
          openEvents.map(async (e) => {
            const signups = await getEventSignups(e.id);
            counts[e.id] = signups.filter((s) => s.status !== "cancelled").length;
          }),
        );
        setSignupCounts(counts);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

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

  function addRole() {
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
          const realUrl = `${window.location.origin}/events/${ref.id}/signup`;
          await updateChurchDocument(churchId, "events", ref.id, {
            promotion: { ...data.promotion, signup_url: realUrl },
          });
          newEvent.promotion.signup_url = realUrl;
        }
        setEvents((prev) => [...prev, newEvent]);
      }
      resetForm();
    } catch {
      // silent
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
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  }

  function copySignupLink(eventId: string) {
    const url = `${window.location.origin}/events/${eventId}/signup`;
    navigator.clipboard.writeText(url);
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
      {!showForm && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setShowForm(true)}>Create Event</Button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="mb-8 rounded-xl border border-vc-border-light bg-white p-6">
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
              </div>
              <div className="space-y-3">
                {roles.map((role, i) => (
                  <div key={role.role_id} className="rounded-lg border border-vc-border-light bg-vc-bg/50 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
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
                    {role.title.trim() && (
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

                        {/* Per-role time override */}
                        <span className="text-xs text-vc-text-muted shrink-0">Times:</span>
                        <input
                          type="time"
                          className="rounded-md border border-vc-border bg-white px-2 py-1 text-xs text-vc-text focus:border-vc-coral focus:outline-none focus:ring-1 focus:ring-vc-coral/20"
                          value={role.start_time || ""}
                          onChange={(e) => updateRole(i, "start_time", e.target.value || null)}
                        />
                        <span className="text-xs text-vc-text-muted">to</span>
                        <input
                          type="time"
                          className="rounded-md border border-vc-border bg-white px-2 py-1 text-xs text-vc-text focus:border-vc-coral focus:outline-none focus:ring-1 focus:ring-vc-coral/20"
                          value={role.end_time || ""}
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
                        {!role.start_time && !role.end_time && (
                          <span className="text-xs text-vc-text-muted italic">
                            {allDay ? "No times set" : "Using event default"}
                          </span>
                        )}
                      </div>
                    )}
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
        <div className="py-12 text-center text-vc-text-muted">Loading...</div>
      ) : events.length === 0 && !showForm ? (
        <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
          <p className="text-vc-text-secondary">No events yet.</p>
          <p className="mt-1 text-sm text-vc-text-muted">
            Create an event to let volunteers sign up for roles.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Upcoming */}
          {upcomingEvents.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-vc-text-muted">
                Upcoming
              </h2>
              <div className="space-y-3">
                {upcomingEvents.map((ev) => (
                  <EventCard
                    key={ev.id}
                    event={ev}
                    signupCount={signupCounts[ev.id] || 0}
                    onEdit={() => startEdit(ev)}
                    onDelete={() => handleDelete(ev.id)}
                    onCopyLink={() => copySignupLink(ev.id)}
                    deleting={deleting === ev.id}
                    getMinistryNames={getMinistryNames}
                    formatTime={formatTime}
                  />
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
                  <EventCard
                    key={ev.id}
                    event={ev}
                    signupCount={signupCounts[ev.id] || 0}
                    onEdit={() => startEdit(ev)}
                    onDelete={() => handleDelete(ev.id)}
                    onCopyLink={() => copySignupLink(ev.id)}
                    deleting={deleting === ev.id}
                    getMinistryNames={getMinistryNames}
                    formatTime={formatTime}
                    isPast
                  />
                ))}
              </div>
            </div>
          )}
        </div>
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
  deleting,
  getMinistryNames,
  formatTime,
  isPast,
}: {
  event: Event;
  signupCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  deleting: boolean;
  getMinistryNames: (ids: string[]) => string;
  formatTime: (t: string | null) => string;
  isPast?: boolean;
}) {
  const totalSlots = ev.roles.reduce((sum, r) => sum + r.count, 0);

  return (
    <div
      className={`group rounded-xl border border-vc-border-light bg-white p-5 transition-shadow hover:shadow-md ${
        isPast ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
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
            {ev.date}
            {ev.all_day
              ? " \u00b7 All day"
              : ev.start_time
                ? ` \u00b7 ${formatTime(ev.start_time)}${ev.end_time ? `\u2013${formatTime(ev.end_time)}` : ""}`
                : ""}
            {ev.event_type === "recurring" && ` \u00b7 ${ev.recurrence}`}
            {" \u00b7 "}
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
            <span className="text-xs text-vc-text-muted">
              {signupCount}/{totalSlots} signed up
            </span>
          )}
        </div>
      </div>

      {/* Roles */}
      {ev.roles.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ev.roles.map((r) => {
            const hasCustomTime = r.start_time || r.end_time;
            const timeStr = hasCustomTime
              ? ` (${formatTime(r.start_time)}\u2013${formatTime(r.end_time)})`
              : "";
            return (
              <span
                key={r.role_id}
                className="rounded-lg bg-vc-indigo/5 px-2.5 py-1 text-xs font-medium text-vc-indigo"
              >
                {r.title} \u00d7{r.count}
                {timeStr}
                {r.allow_signup && (
                  <span className="ml-1 text-vc-sage" title="Open for signup">\u25cf</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="text-xs font-medium text-vc-text-secondary hover:text-vc-coral transition-colors"
        >
          Edit
        </button>
        {(ev.signup_mode !== "scheduled" || ev.visibility === "public") && (
          <button
            onClick={onCopyLink}
            className="text-xs font-medium text-vc-text-secondary hover:text-vc-coral transition-colors"
          >
            Copy signup link
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={deleting}
          className="text-xs font-medium text-vc-text-muted hover:text-vc-danger transition-colors"
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  );
}
