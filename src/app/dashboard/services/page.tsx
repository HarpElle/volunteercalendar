"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/context/auth-context";
import {
  addChurchDocument,
  getChurchDocuments,
  updateChurchDocument,
  removeChurchDocument,
} from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Service, ServiceRole, Ministry, RecurrencePattern } from "@/lib/types";

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

export default function ServicesPage() {
  const { profile } = useAuth();
  const churchId = profile?.church_id;

  const [services, setServices] = useState<Service[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
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
  const [durationMinutes, setDurationMinutes] = useState("90");
  const [roles, setRoles] = useState<ServiceRole[]>([
    { role_id: crypto.randomUUID(), title: "", count: 1 },
  ]);

  useEffect(() => {
    if (!churchId) return;
    async function load() {
      try {
        const [svcs, mins] = await Promise.all([
          getChurchDocuments(churchId!, "services"),
          getChurchDocuments(churchId!, "ministries"),
        ]);
        setServices(svcs as unknown as Service[]);
        setMinistries(mins as unknown as Ministry[]);
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
    setMinistryId("");
    setRecurrence("weekly");
    setDayOfWeek("0");
    setStartTime("09:00");
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
    setDurationMinutes(String(s.duration_minutes));
    setRoles(s.roles.length > 0 ? s.roles : [{ role_id: crypto.randomUUID(), title: "", count: 1 }]);
    setEditingId(s.id);
    setShowForm(true);
  }

  function addRole() {
    setRoles((prev) => [...prev, { role_id: crypto.randomUUID(), title: "", count: 1 }]);
  }

  function updateRole(index: number, field: keyof ServiceRole, value: string | number) {
    setRoles((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
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
        start_time: startTime,
        duration_minutes: Number(durationMinutes),
        roles: filteredRoles,
        ...(editingId ? {} : { created_at: new Date().toISOString() }),
      };

      if (editingId) {
        await updateChurchDocument(churchId, "services", editingId, data);
        setServices((prev) =>
          prev.map((s) => (s.id === editingId ? { ...s, ...data } : s))
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
    return ministries.find((m) => m.id === id)?.name || "—";
  }

  function getDayName(day: number) {
    return DAYS.find((d) => d.value === String(day))?.label || "—";
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">Services</h1>
          <p className="mt-1 text-vc-text-secondary">
            Configure recurring services and the roles needed for each.
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>Add Service</Button>
        )}
      </div>

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

            <div className="grid gap-4 sm:grid-cols-4">
              <Select
                label="Day"
                options={DAYS}
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
              />
              <Input
                label="Start Time"
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <Input
                label="Duration (min)"
                type="number"
                required
                min={15}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
              <Select
                label="Recurrence"
                options={RECURRENCE_OPTIONS}
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as RecurrencePattern)}
              />
            </div>

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
              <div className="space-y-2">
                {roles.map((role, i) => (
                  <div key={role.role_id} className="flex items-center gap-2">
                    <input
                      className="flex-1 rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                      placeholder="Role title (e.g., Lead Vocalist)"
                      value={role.title}
                      onChange={(e) => updateRole(i, "title", e.target.value)}
                    />
                    <input
                      type="number"
                      min={1}
                      className="w-20 rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
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
      {loading ? (
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
                    {getDayName(s.day_of_week)} at {s.start_time} · {s.duration_minutes} min · {getMinistryName(s.ministry_id)}
                  </p>
                </div>
                <span className="rounded-full bg-vc-bg-warm px-3 py-1 text-xs font-medium text-vc-text-secondary capitalize">
                  {s.recurrence}
                </span>
              </div>
              {s.roles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.roles.map((r) => (
                    <span
                      key={r.role_id}
                      className="rounded-lg bg-vc-indigo/5 px-2.5 py-1 text-xs font-medium text-vc-indigo"
                    >
                      {r.title} ×{r.count}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
