"use client";

import { useEffect, useState, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { getEventSignups, updateSignupAttendance } from "@/lib/firebase/firestore";
import { isAdmin } from "@/lib/utils/permissions";
import { useAuth } from "@/lib/context/auth-context";
import type { Event, EventSignup, Membership } from "@/lib/types";

interface EventRosterProps {
  event: Event;
  churchId: string;
  open: boolean;
  onClose: () => void;
  canMarkAttendance?: boolean;
  activeMembership?: Membership | null;
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
  activeMembership,
}: EventRosterProps) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [signups, setSignups] = useState<EventSignup[]>([]);
  const [tab, setTab] = useState<Tab>("roster");
  const [attendanceMap, setAttendanceMap] = useState<Map<string, boolean | null>>(new Map());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [movingSignup, setMovingSignup] = useState<EventSignup | null>(null);

  const canModify = activeMembership ? isAdmin(activeMembership) || (activeMembership.role === "scheduler") : false;

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

  const handleRemove = async (signupId: string) => {
    setRemoving(signupId);
    try {
      const idToken = await user?.getIdToken();
      if (!idToken) return;
      const res = await fetch("/api/roster/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          church_id: churchId,
          action: "remove",
          item_type: "event_signup",
          item_id: signupId,
          initiated_by_name: profile?.display_name || "Admin",
        }),
      });
      if (res.ok) await loadSignups();
    } catch {
      // silent
    } finally {
      setRemoving(null);
      setActionMenuId(null);
    }
  };

  const handleMove = async (signup: EventSignup, newRoleId: string, newRoleTitle: string) => {
    try {
      const idToken = await user?.getIdToken();
      if (!idToken) return;
      const res = await fetch("/api/roster/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          church_id: churchId,
          action: "move",
          item_type: "event_signup",
          item_id: signup.id,
          new_role_id: newRoleId,
          new_role_title: newRoleTitle,
          initiated_by_name: profile?.display_name || "Admin",
        }),
      });
      if (res.ok) await loadSignups();
    } catch {
      // silent
    } finally {
      setMovingSignup(null);
      setActionMenuId(null);
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
      {/* Print-only header (hidden on screen) */}
      <div className="print-only hidden mb-4">
        <h1 className="text-xl font-bold">{event.name}</h1>
        <p className="text-sm text-gray-600">{subtitle}</p>
      </div>

      {/* Tab bar */}
      {showAttendanceTab && (
        <div className="mb-4 flex gap-1 rounded-lg bg-vc-bg-warm p-1 no-print">
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
            <div className="flex items-center gap-2">
              {tab === "attendance" && (
                <Button variant="ghost" size="sm" onClick={markAllPresent} className="no-print">
                  Mark all present
                </Button>
              )}
              <button
                onClick={() => window.print()}
                className="no-print flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-vc-text-muted hover:bg-vc-bg-warm hover:text-vc-indigo transition-colors"
                title="Print roster"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.25 7.034l-.25-.004" />
                </svg>
                Print
              </button>
            </div>
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
                        <div className="flex items-center gap-2">
                          {tab === "roster" ? (
                            <StatusBadge status={signup.status} />
                          ) : (
                            <AttendanceToggle
                              value={attendanceMap.get(signup.id) ?? null}
                              onClick={() => toggleAttendance(signup.id)}
                            />
                          )}
                          {canModify && tab === "roster" && (
                            <div className="relative no-print">
                              <button
                                onClick={() => setActionMenuId(actionMenuId === signup.id ? null : signup.id)}
                                className="rounded p-1 text-vc-text-muted hover:bg-vc-bg-warm hover:text-vc-indigo"
                              >
                                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                </svg>
                              </button>
                              {actionMenuId === signup.id && (
                                <div className="absolute right-0 top-8 z-10 w-44 rounded-lg border border-vc-border bg-white py-1 shadow-lg">
                                  <button
                                    onClick={() => handleRemove(signup.id)}
                                    disabled={removing === signup.id}
                                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                                  >
                                    {removing === signup.id ? "Removing..." : "Remove from role"}
                                  </button>
                                  {event.roles.filter((r) => r.role_id !== role.role_id).length > 0 && (
                                    <>
                                      <div className="mx-2 my-1 border-t border-vc-border-light" />
                                      <p className="px-3 py-1 text-[11px] font-medium uppercase text-vc-text-muted">Move to...</p>
                                      {event.roles
                                        .filter((r) => r.role_id !== role.role_id)
                                        .map((r) => (
                                          <button
                                            key={r.role_id}
                                            onClick={() => handleMove(signup, r.role_id, r.title)}
                                            className="w-full px-3 py-2 text-left text-sm text-vc-text hover:bg-vc-bg-warm"
                                          >
                                            {r.title}
                                          </button>
                                        ))}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
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
            <div className="mt-6 flex justify-end border-t border-vc-border-light pt-4 no-print">
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
