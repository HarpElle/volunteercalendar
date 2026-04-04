"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type {
  ServiceRole,
  RecurrencePattern,
  Ministry,
  Volunteer,
  EditScope,
  ServiceChangeRecord,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants (duplicated from page — keep in sync or extract to shared file)
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormMinistry = {
  id: string; // local form ID
  ministry_id: string;
  roles: ServiceRole[];
  start_time: string | null;
  end_time: string | null;
  is_default: boolean;
};

export interface ServiceFormData {
  name: string;
  recurrence: RecurrencePattern;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  durationMinutes: string;
  campusId: string;
  formMinistries: {
    ministry_id: string;
    roles: ServiceRole[];
    start_time: string | null;
    end_time: string | null;
    is_default: boolean;
  }[];
  edit_scope?: EditScope;
  effective_from_date?: string;
}

export interface ServiceFormValues {
  name: string;
  recurrence: RecurrencePattern;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  durationMinutes: string;
  campusId: string;
  formMinistries: FormMinistry[];
  changeHistory?: ServiceChangeRecord[];
}

interface ServiceFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ServiceFormData) => Promise<void>;
  saving: boolean;
  initialValues?: ServiceFormValues;
  isEditing: boolean;
  ministries: Ministry[];
  volunteers: Volunteer[];
  campuses: { id: string; name: string }[];
  tierLimits: { roles_per_service: number };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function defaultFormMinistry(): FormMinistry {
  return {
    id: crypto.randomUUID(),
    ministry_id: "",
    roles: [{ role_id: crypto.randomUUID(), title: "", count: 1 }],
    start_time: null,
    end_time: null,
    is_default: true,
  };
}

function defaultValues(): ServiceFormValues {
  return {
    name: "",
    recurrence: "weekly",
    dayOfWeek: "0",
    startTime: "09:00",
    endTime: "10:30",
    allDay: false,
    durationMinutes: "90",
    campusId: "",
    formMinistries: [defaultFormMinistry()],
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ServiceFormModal({
  open,
  onClose,
  onSubmit,
  saving,
  initialValues,
  isEditing,
  ministries,
  volunteers,
  campuses,
  tierLimits,
}: ServiceFormModalProps) {
  // Form state
  const [name, setName] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrencePattern>("weekly");
  const [dayOfWeek, setDayOfWeek] = useState("0");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:30");
  const [allDay, setAllDay] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState("90");
  const [campusId, setCampusId] = useState("");
  const [formMinistries, setFormMinistries] = useState<FormMinistry[]>([defaultFormMinistry()]);
  const [tierWarning, setTierWarning] = useState("");
  const [editScope, setEditScope] = useState<EditScope>("next");
  const [effectiveFromDate, setEffectiveFromDate] = useState("");
  const [timelineOpen, setTimelineOpen] = useState(false);

  // Initialize / reset when modal opens
  useEffect(() => {
    if (open) {
      const vals = initialValues ?? defaultValues();
      setName(vals.name);
      setRecurrence(vals.recurrence);
      setDayOfWeek(vals.dayOfWeek);
      setStartTime(vals.startTime);
      setEndTime(vals.endTime);
      setAllDay(vals.allDay);
      setDurationMinutes(vals.durationMinutes);
      setCampusId(vals.campusId);
      setFormMinistries(
        vals.formMinistries.length > 0
          ? vals.formMinistries
          : [defaultFormMinistry()],
      );
      setTierWarning("");
      setEditScope("next");
      setEffectiveFromDate("");
      setTimelineOpen(false);
    }
  }, [open, initialValues]);

  // ---------------------------------------------------------------------------
  // Ministry / role helpers
  // ---------------------------------------------------------------------------

  function addMinistrySection() {
    setFormMinistries((prev) => [...prev, defaultFormMinistry()]);
  }

  function removeMinistrySection(fmId: string) {
    setFormMinistries((prev) => prev.filter((m) => m.id !== fmId));
  }

  function updateMinistryField(fmId: string, field: string, value: string | null) {
    setFormMinistries((prev) =>
      prev.map((m) => (m.id === fmId ? { ...m, [field]: value } : m)),
    );
  }

  function addRoleToMinistry(fmId: string) {
    const totalRoles = formMinistries.reduce((sum, m) => sum + m.roles.length, 0);
    if (totalRoles >= tierLimits.roles_per_service) {
      setTierWarning(
        `Your plan allows up to ${tierLimits.roles_per_service} roles per service. Upgrade to add more.`,
      );
      return;
    }
    setTierWarning("");
    setFormMinistries((prev) =>
      prev.map((m) =>
        m.id === fmId
          ? { ...m, roles: [...m.roles, { role_id: crypto.randomUUID(), title: "", count: 1 }] }
          : m,
      ),
    );
  }

  function updateRoleInMinistry(
    fmId: string,
    roleIdx: number,
    field: string,
    value: string | number | null,
  ) {
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
        m.id === fmId ? { ...m, roles: m.roles.filter((_, i) => i !== roleIdx) } : m,
      ),
    );
  }

  function toggleMinistryDefault(fmId: string) {
    setFormMinistries((prev) =>
      prev.map((m) =>
        m.id === fmId ? { ...m, is_default: !m.is_default } : m,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit({
      name,
      recurrence,
      dayOfWeek,
      startTime,
      endTime,
      allDay,
      durationMinutes,
      campusId,
      formMinistries: formMinistries.map((m) => ({
        ministry_id: m.ministry_id,
        roles: m.roles,
        start_time: m.start_time,
        end_time: m.end_time,
        is_default: m.is_default,
      })),
      ...(isEditing
        ? {
            edit_scope: editScope,
            ...(editScope !== "next" ? { effective_from_date: effectiveFromDate } : {}),
          }
        : {}),
    });
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const usedMinistryIds = formMinistries.map((m) => m.ministry_id).filter(Boolean);

  function getMinistryColor(id: string) {
    return ministries.find((m) => m.id === id)?.color || "#9A9BB5";
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit Service" : "New Service"}
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className={campuses.length > 0 ? "grid gap-4 sm:grid-cols-2" : ""}>
          <Input
            label="Service Name"
            required
            placeholder="e.g., Sunday Morning Worship"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {campuses.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-vc-text">Campus</label>
              <select
                className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                value={campusId}
                onChange={(e) => setCampusId(e.target.value)}
              >
                <option value="">All campuses</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
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
              const availableMinistries = ministries
                .filter((m) => m.id === fm.ministry_id || !usedMinistryIds.includes(m.id))
                .sort((a, b) => a.name.localeCompare(b.name));

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
                        <span className="text-xs text-vc-text-muted">&ndash;</span>
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

                    <label
                      className="flex items-center gap-1.5 text-xs cursor-pointer select-none whitespace-nowrap"
                      title={fm.is_default ? "Always scheduled — toggle off to make this ministry optional per occurrence" : "Optional/ad-hoc — toggle on to always include this ministry"}
                    >
                      <button
                        type="button"
                        role="switch"
                        aria-checked={fm.is_default}
                        onClick={() => toggleMinistryDefault(fm.id)}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vc-coral/30 focus-visible:ring-offset-1 ${fm.is_default ? "bg-vc-sage" : "bg-vc-border"}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${fm.is_default ? "translate-x-[18px]" : "translate-x-[3px]"}`}
                        />
                      </button>
                      <span className={fm.is_default ? "text-vc-sage-dark" : "text-vc-text-muted"}>
                        {fm.is_default ? "Always included" : "Optional"}
                      </span>
                    </label>

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
                    {fm.roles.map((role, ri) => {
                      // Filter volunteers to those in this ministry
                      const ministryVols = volunteers.filter(
                        (vol) => vol.ministry_ids.length === 0 || vol.ministry_ids.includes(fm.ministry_id),
                      );
                      return (
                      <div key={role.role_id} className="flex items-center gap-2 flex-wrap">
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
                        <select
                          className="max-w-[180px] rounded-lg border border-vc-border bg-white px-2 py-2 text-xs text-vc-text-secondary focus:border-vc-coral focus:outline-none"
                          value={role.pinned_volunteer_id || ""}
                          onChange={(e) => updateRoleInMinistry(fm.id, ri, "pinned_volunteer_id", e.target.value || null)}
                          title="Pin a default volunteer to this role"
                        >
                          <option value="">No pinned volunteer</option>
                          {ministryVols.map((vol) => (
                            <option key={vol.id} value={vol.id}>{vol.name}</option>
                          ))}
                        </select>
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
                      );
                    })}
                    {tierWarning && (
                      <p className="text-xs text-vc-warning bg-vc-sand/20 rounded px-2 py-1">{tierWarning}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => addRoleToMinistry(fm.id)}
                      disabled={!!tierWarning}
                      className={`text-xs font-medium transition-colors ${tierWarning ? "text-vc-text-muted cursor-not-allowed" : "text-vc-coral hover:text-vc-coral-dark"}`}
                    >
                      + Add role
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Effective-from date change UI — only when editing */}
        {isEditing && (
          <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm/50 p-4">
            <label className="mb-3 block text-sm font-semibold text-vc-indigo">
              When should this change take effect?
            </label>
            <div className="space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="radio"
                  name="edit_scope"
                  value="next"
                  checked={editScope === "next"}
                  onChange={() => setEditScope("next")}
                  className="mt-0.5 h-4 w-4 border-vc-border text-vc-coral focus:ring-vc-coral/30"
                />
                <div>
                  <span className="text-sm font-medium text-vc-text group-hover:text-vc-indigo transition-colors">
                    From next occurrence
                  </span>
                  <p className="text-xs text-vc-text-muted">
                    Changes apply starting at the very next scheduled date.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="radio"
                  name="edit_scope"
                  value="from_date"
                  checked={editScope === "from_date"}
                  onChange={() => setEditScope("from_date")}
                  className="mt-0.5 h-4 w-4 border-vc-border text-vc-coral focus:ring-vc-coral/30"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-vc-text group-hover:text-vc-indigo transition-colors">
                    From a specific date forward
                  </span>
                  <p className="text-xs text-vc-text-muted">
                    Changes apply from the chosen date onward, leaving earlier dates unchanged.
                  </p>
                  {editScope === "from_date" && (
                    <div className="mt-2">
                      <Input
                        type="date"
                        required
                        value={effectiveFromDate}
                        onChange={(e) => setEffectiveFromDate(e.target.value)}
                        className="max-w-[200px] text-sm"
                      />
                    </div>
                  )}
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="radio"
                  name="edit_scope"
                  value="single_date"
                  checked={editScope === "single_date"}
                  onChange={() => setEditScope("single_date")}
                  className="mt-0.5 h-4 w-4 border-vc-border text-vc-coral focus:ring-vc-coral/30"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-vc-text group-hover:text-vc-indigo transition-colors">
                    Only on specific date(s)
                  </span>
                  <p className="text-xs text-vc-text-muted">
                    A one-time override for a single occurrence. All other dates stay the same.
                  </p>
                  {editScope === "single_date" && (
                    <div className="mt-2">
                      <Input
                        type="date"
                        required
                        value={effectiveFromDate}
                        onChange={(e) => setEffectiveFromDate(e.target.value)}
                        className="max-w-[200px] text-sm"
                      />
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Service Timeline — collapsible change history */}
        {isEditing && initialValues?.changeHistory && initialValues.changeHistory.length > 0 && (
          <div className="rounded-xl border border-vc-border-light bg-vc-bg/30">
            <button
              type="button"
              onClick={() => setTimelineOpen((prev) => !prev)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-vc-indigo hover:bg-vc-bg-warm/30 transition-colors rounded-xl"
            >
              <span>Service Timeline</span>
              <svg
                className={`h-4 w-4 text-vc-text-muted transition-transform ${timelineOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {timelineOpen && (
              <div className="border-t border-vc-border-light px-4 py-3">
                <div className="space-y-2">
                  {initialValues.changeHistory.map((entry, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 text-xs"
                    >
                      <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-vc-coral" />
                      <div className="min-w-0">
                        <span className="font-medium text-vc-text">
                          {entry.change_type.replace(/_/g, " ")}
                        </span>
                        <span className="mx-1.5 text-vc-text-muted">&middot;</span>
                        <span className="text-vc-text-secondary">
                          effective {new Date(entry.effective_from).toLocaleDateString()}
                        </span>
                        <p className="text-vc-text-muted">
                          Changed {new Date(entry.changed_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={saving}>
            {isEditing ? "Save Changes" : "Create Service"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
