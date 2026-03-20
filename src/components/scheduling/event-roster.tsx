"use client";

import { useEffect, useState, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { getEventSignups, updateSignupAttendance } from "@/lib/firebase/firestore";
import type { Event, EventSignup } from "@/lib/types";

interface EventRosterProps {
  event: Event;
  churchId: string;
  open: boolean;
  onClose: () => void;
  canMarkAttendance?: boolean;
}

type Tab = "roster" | "attendance";

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

export function EventRoster({
  event,
  churchId,
  open,
  onClose,
  canMarkAttendance = false,
}: EventRosterProps) {
  const [loading, setLoading] = useState(true);
  const [signups, setSignups] = useState<EventSignup[]>([]);
  const [tab, setTab] = useState<Tab>("roster");
  const [attendanceMap, setAttendanceMap] = useState<Map<string, boolean | null>>(new Map());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const isPastOrToday = event.date <= today;
  const showAttendanceTab = canMarkAttendance && isPastOrToday;

  const loadSignups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEventSignups(event.id, churchId);
      const active = data.filter((s) => s.status !== "cancelled");
      setSignups(active);
      const aMap = new Map<string, boolean | null>();
      for (const s of active) {
        aMap.set(s.id, s.attended ?? null);
      }
      setAttendanceMap(aMap);
      setDirty(false);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [event.id, churchId]);

  useEffect(() => {
    if (open) loadSignups();
  }, [open, loadSignups]);

  // Group signups by role
  const roleGroups = event.roles.map((role) => {
    const roleSignups = signups.filter((s) => s.role_id === role.role_id);
    return { role, signups: roleSignups };
  });

  const totalSlots = event.roles.reduce((sum, r) => sum + r.count, 0);
  const totalFilled = signups.length;

  const toggleAttendance = (signupId: string) => {
    setAttendanceMap((prev) => {
      const next = new Map(prev);
      const current = next.get(signupId);
      // cycle: null → true → false → true
      if (current === null || current === undefined) {
        next.set(signupId, true);
      } else if (current === true) {
        next.set(signupId, false);
      } else {
        next.set(signupId, true);
      }
      return next;
    });
    setDirty(true);
  };

  const markAllPresent = () => {
    setAttendanceMap((prev) => {
      const next = new Map(prev);
      for (const s of signups) {
        next.set(s.id, true);
      }
      return next;
    });
    setDirty(true);
  };

  const saveAttendance = async () => {
    setSaving(true);
    try {
      const promises: Promise<void>[] = [];
      for (const s of signups) {
        const newVal = attendanceMap.get(s.id);
        if (newVal !== (s.attended ?? null)) {
          promises.push(updateSignupAttendance(s.id, newVal === true));
        }
      }
      await Promise.all(promises);
      await loadSignups();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const subtitle = [
    formatDate(event.date),
    event.start_time ? formatTime(event.start_time) : event.all_day ? "All day" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Modal open={open} onClose={onClose} title={event.name} subtitle={subtitle}>
      {/* Tab bar */}
      {showAttendanceTab && (
        <div className="mb-4 flex gap-1 rounded-lg bg-vc-bg-warm p-1">
          {(["roster", "attendance"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "bg-white text-vc-indigo shadow-sm"
                  : "text-vc-text-muted hover:text-vc-indigo"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : signups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-vc-border bg-vc-bg-warm/50 p-8 text-center">
          <p className="text-vc-text-muted">No one has signed up for this event yet.</p>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-vc-text-secondary">
              <span className="font-semibold text-vc-indigo">{totalFilled}</span>
              <span className="text-vc-text-muted">/{totalSlots}</span> signed up
            </p>
            {tab === "attendance" && (
              <Button variant="ghost" size="sm" onClick={markAllPresent}>
                Mark all present
              </Button>
            )}
          </div>

          {/* Role groups */}
          <div className="space-y-4">
            {roleGroups.map(({ role, signups: roleSignups }) => (
              <div key={role.role_id}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-vc-text-muted">
                    {role.title}
                  </h3>
                  <span className="text-xs text-vc-text-muted">
                    {roleSignups.length}/{role.count}
                  </span>
                </div>
                {roleSignups.length === 0 ? (
                  <p className="rounded-lg bg-vc-bg-warm/50 px-3 py-2 text-sm italic text-vc-text-muted">
                    No signups
                  </p>
                ) : (
                  <div className="space-y-1">
                    {roleSignups.map((signup) => (
                      <div
                        key={signup.id}
                        className="flex items-center justify-between rounded-lg border border-vc-border-light bg-white px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-vc-indigo">
                            {signup.volunteer_name}
                          </p>
                          <p className="truncate text-xs text-vc-text-muted">
                            {signup.volunteer_email}
                          </p>
                        </div>
                        {tab === "roster" ? (
                          <StatusBadge status={signup.status} />
                        ) : (
                          <AttendanceToggle
                            value={attendanceMap.get(signup.id) ?? null}
                            onClick={() => toggleAttendance(signup.id)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {roleSignups.length < role.count && (
                  <p className="mt-1 text-xs italic text-vc-text-muted">
                    {role.count - roleSignups.length} unfilled
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Save button for attendance */}
          {tab === "attendance" && dirty && (
            <div className="mt-6 flex justify-end border-t border-vc-border-light pt-4">
              <Button onClick={saveAttendance} loading={saving}>
                Save Attendance
              </Button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    confirmed: "bg-vc-sage/15 text-vc-sage",
    waitlisted: "bg-vc-sand/15 text-vc-sand",
    cancelled: "bg-gray-100 text-gray-500",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status] || "bg-gray-100 text-gray-500"}`}
    >
      {status}
    </span>
  );
}

function AttendanceToggle({
  value,
  onClick,
}: {
  value: boolean | null;
  onClick: () => void;
}) {
  if (value === true) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 rounded-full bg-vc-sage/15 px-2.5 py-1 text-xs font-medium text-vc-sage transition-colors hover:bg-vc-sage/25"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Present
      </button>
    );
  }
  if (value === false) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        No-show
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-200"
    >
      Not marked
    </button>
  );
}
