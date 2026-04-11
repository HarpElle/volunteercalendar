"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import {
  addChurchDocument,
  getChurchDocuments,
  updateChurchDocument,
  removeChurchDocument,
} from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ServiceRoster } from "@/components/scheduling/service-roster";
import { ServiceFormModal, type ServiceFormData, type ServiceFormValues } from "@/components/forms/service-form-modal";
import { isScheduler } from "@/lib/utils/permissions";
import { TIER_LIMITS } from "@/lib/constants";
import type {
  Service,
  ServiceRole,
  Ministry,
  Person,
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ServicesListProps {
  churchId: string | undefined;
  churchName: string;
  churchTier: string;
  activeMembership: ReturnType<typeof useAuth>["activeMembership"];
  ministries: Ministry[];
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNextServiceDate(service: Service): string {
  const today = new Date();
  const todayDay = today.getDay(); // 0=Sun
  let diff = service.day_of_week - todayDay;
  if (diff < 0) diff += 7;
  const next = new Date(today);
  next.setDate(today.getDate() + diff);
  const yyyy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ServicesList({
  churchId,
  churchName,
  churchTier,
  activeMembership,
  ministries,
  loading: ministriesLoading,
}: ServicesListProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [volunteers, setVolunteers] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [rosterService, setRosterService] = useState<{ service: Service; date: string } | null>(null);
  const userCanMarkAttendance = isScheduler(activeMembership);

  // Campuses
  const [campuses, setCampuses] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!churchId) return;
    Promise.all([
      getChurchDocuments(churchId, "services"),
      getChurchDocuments(churchId, "people"),
      getChurchDocuments(churchId, "campuses"),
    ])
      .then(([svcs, peopleDocs, camps]) => {
        setServices(svcs as unknown as Service[]);
        setVolunteers(
          (peopleDocs as unknown as Person[])
            .filter((d) => d.is_volunteer && d.status === "active"),
        );
        setCampuses((camps as unknown as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [churchId]);

  const svcTierLimits = TIER_LIMITS[churchTier] || TIER_LIMITS.free;

  function closeForm() {
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(s: Service) {
    setEditingId(s.id);
    setShowForm(true);
  }

  // Compute initialValues for the modal from the service being edited
  function getInitialValues(): ServiceFormValues | undefined {
    if (!editingId) return undefined;
    const s = services.find((svc) => svc.id === editingId);
    if (!s) return undefined;

    let fmList: ServiceFormValues["formMinistries"];
    if (s.ministries && s.ministries.length > 0) {
      fmList = s.ministries.map((m) => ({
        id: crypto.randomUUID(),
        ministry_id: m.ministry_id,
        roles: m.roles.length > 0 ? m.roles : [{ role_id: crypto.randomUUID(), title: "", count: 1 }],
        start_time: m.start_time,
        end_time: m.end_time,
        is_default: true,
      }));
    } else {
      fmList = [
        {
          id: crypto.randomUUID(),
          ministry_id: s.ministry_id,
          roles: s.roles.length > 0 ? s.roles : [{ role_id: crypto.randomUUID(), title: "", count: 1 }],
          start_time: null,
          end_time: null,
          is_default: true,
        },
      ];
    }

    return {
      name: s.name,
      recurrence: s.recurrence,
      dayOfWeek: String(s.day_of_week),
      startTime: s.start_time,
      endTime: s.end_time || "",
      allDay: s.all_day || false,
      durationMinutes: String(s.duration_minutes),
      campusId: s.campus_id || "",
      formMinistries: fmList,
      changeHistory: s.change_history,
    };
  }

  async function handleSubmit(formData: ServiceFormData) {
    if (!churchId) return;
    setSaving(true);

    try {
      // Build ministries array
      const builtMinistries = formData.formMinistries
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
        name: formData.name,
        church_id: churchId,
        ministry_id: primaryMinistryId,
        campus_id: formData.campusId || null,
        recurrence: formData.recurrence,
        day_of_week: Number(formData.dayOfWeek),
        start_time: formData.allDay ? "00:00" : formData.startTime,
        end_time: formData.allDay ? null : (formData.endTime || null),
        all_day: formData.allDay,
        duration_minutes: Number(formData.durationMinutes),
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
      closeForm();
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

  return (
    <div>
      {mutationError && (
        <div className="mb-4 rounded-xl border border-vc-danger/20 bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
          {mutationError}
        </div>
      )}
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setShowForm(true)}>Add Service</Button>
      </div>

      {/* Service Form Modal */}
      <ServiceFormModal
        open={showForm}
        onClose={closeForm}
        onSubmit={handleSubmit}
        saving={saving}
        initialValues={getInitialValues()}
        isEditing={!!editingId}
        ministries={ministries}
        volunteers={volunteers}
        campuses={campuses}
        tierLimits={svcTierLimits}
      />

      {/* Service list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : services.length === 0 ? (
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
                      {getDayName(s.day_of_week)}{s.all_day ? " \u00b7 All day" : ` \u00b7 ${s.start_time}${s.end_time ? `\u2013${s.end_time}` : ` \u00b7 ${s.duration_minutes} min`}`}{" \u00b7 "}{getServiceMinistryNames(s)}
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
                            <span className="opacity-80 ml-1">{sm.start_time}{sm.end_time ? `\u2013${sm.end_time}` : ""}</span>
                          )}
                        </span>
                        {sm.roles.map((r) => (
                          <span key={r.role_id} className="rounded-lg bg-vc-indigo/5 px-2.5 py-0.5 text-xs font-medium text-vc-indigo">
                            {r.title}{" \u00d7"}{r.count}
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
                          {r.title}{" \u00d7"}{r.count}{timeStr}
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                {/* Actions -- always visible */}
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
                  <button
                    onClick={() => setRosterService({ service: s, date: getNextServiceDate(s) })}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-vc-text-secondary hover:bg-vc-bg-warm hover:text-vc-indigo transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                    </svg>
                    Roster & Attendance
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

      {/* Service Roster Modal */}
      {rosterService && churchId && (
        <ServiceRoster
          service={rosterService.service}
          serviceDate={rosterService.date}
          churchId={churchId}
          open={!!rosterService}
          onClose={() => setRosterService(null)}
          canMarkAttendance={userCanMarkAttendance}
          activeMembership={activeMembership}
          orgName={churchName}
        />
      )}
    </div>
  );
}
