"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getAuth } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { PeopleShell } from "@/components/dashboard/people-shell";
import { isScheduler } from "@/lib/utils/permissions";
import { ORG_WIDE_MINISTRY_ID } from "@/lib/types";
import type {
  Ministry,
  TrainingSession,
  OnboardingStep,
  TrainingSessionStatus,
} from "@/lib/types";

type StatusFilter = "all" | TrainingSessionStatus;

/**
 * /dashboard/training-sessions — admin list of training sessions plus a
 * "New Session" create modal. PR #38 (Phase 6 follow-up #4).
 *
 * The backend (POST /api/training-sessions, /invite, /rsvp, /complete)
 * shipped earlier; this page is the admin entry point that was deferred
 * in PR #31. Each row links to /dashboard/training-sessions/[id] for the
 * RSVP roster + Mark Complete flow.
 */
export default function TrainingSessionsPage() {
  const { user, profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;
  const canManage = isScheduler(activeMembership);

  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [orgPrereqs, setOrgPrereqs] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // PR #39 polish: respect ?status= query param so the detail page can
  // redirect back to the right filter after a Cancel (otherwise the
  // cancelled session "vanishes" into the hidden Cancelled tab without
  // visible confirmation).
  const searchParams = useSearchParams();
  const initialFilter: StatusFilter = (() => {
    const q = searchParams.get("status");
    if (q === "scheduled" || q === "completed" || q === "cancelled" || q === "all") {
      return q;
    }
    return "scheduled";
  })();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialFilter);
  const [showCreate, setShowCreate] = useState(false);

  // Load sessions + ministries + church (for org prereqs) on mount.
  useEffect(() => {
    if (!churchId || !user) return;
    async function load() {
      setError(null);
      try {
        const token = await user!.getIdToken();
        const [sessRes, mins, churchSnap] = await Promise.all([
          fetch(`/api/training-sessions?church_id=${encodeURIComponent(churchId!)}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          getChurchDocuments(churchId!, "ministries") as Promise<unknown[]>,
          getDoc(doc(db, "churches", churchId!)),
        ]);
        if (!sessRes.ok) {
          const data = await sessRes.json().catch(() => ({}));
          setError(data.error || `Failed to load (${sessRes.status})`);
        } else {
          const data = await sessRes.json();
          setSessions((data.sessions as TrainingSession[]) || []);
        }
        setMinistries(mins as Ministry[]);
        if (churchSnap.exists()) {
          setOrgPrereqs((churchSnap.data().org_prerequisites as OnboardingStep[]) || []);
        }
      } catch {
        setError("Failed to load training sessions.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId, user]);

  async function refreshSessions() {
    if (!churchId || !user) return;
    const token = await user.getIdToken();
    const res = await fetch(
      `/api/training-sessions?church_id=${encodeURIComponent(churchId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      const data = await res.json();
      setSessions((data.sessions as TrainingSession[]) || []);
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-xl border border-vc-border-light bg-white p-10 text-center">
        <p className="text-vc-text-secondary">
          You need scheduler or admin access to manage training sessions.
        </p>
      </div>
    );
  }

  const filtered = statusFilter === "all"
    ? sessions
    : sessions.filter((s) => s.status === statusFilter);

  const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));

  function ministryName(id: string): string {
    if (id === ORG_WIDE_MINISTRY_ID) return "Organization";
    return ministries.find((m) => m.id === id)?.name || "Unknown team";
  }

  function statusVariant(s: TrainingSessionStatus): "success" | "danger" | "default" {
    if (s === "completed") return "success";
    if (s === "cancelled") return "danger";
    return "default";
  }

  return (
    <div>
      <PeopleShell
        actions={
          <Button onClick={() => setShowCreate(true)} size="md">
            + New Session
          </Button>
        }
      />

      {/* Status filter */}
      <div className="mb-4 inline-flex rounded-lg border border-vc-border-light bg-white p-0.5">
        {(["scheduled", "completed", "cancelled", "all"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              statusFilter === s
                ? "bg-vc-indigo text-white"
                : "text-vc-text-secondary hover:text-vc-indigo"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-vc-danger/20 bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
          <p className="text-vc-text-secondary">
            No {statusFilter === "all" ? "" : `${statusFilter} `}training sessions yet.
          </p>
          {statusFilter === "scheduled" && (
            <p className="mt-1 text-sm text-vc-text-muted">
              Click <strong>+ New Session</strong> to create one tied to an
              existing prerequisite.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((s) => {
            const accepted = (s.rsvps || []).filter((r) => r.status === "accepted").length;
            const declined = (s.rsvps || []).filter((r) => r.status === "declined").length;
            const attended = (s.attendee_ids || []).length;
            return (
              <Link
                key={s.id}
                href={`/dashboard/training-sessions/${s.id}`}
                className="block rounded-xl border border-vc-border-light bg-white px-4 py-3 transition-colors hover:border-vc-coral/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-vc-indigo">{s.title}</span>
                      <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-vc-text-secondary">
                      {s.date} · {s.start_time}–{s.end_time} · {s.location}
                    </p>
                    <p className="mt-0.5 text-xs text-vc-text-muted">
                      For {ministryName(s.ministry_id)}
                      {s.capacity > 0 ? ` · Capacity ${s.capacity}` : ""}
                    </p>
                  </div>
                  <div className="text-right text-xs text-vc-text-muted">
                    {s.status === "completed" ? (
                      <span>{attended} attended</span>
                    ) : (
                      <span>
                        {accepted} accepted · {declined} declined
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateSessionModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await refreshSessions();
          }}
          churchId={churchId!}
          ministries={ministries}
          orgPrereqs={orgPrereqs}
        />
      )}
    </div>
  );
}

/** Inline create-session modal. Kept in this file because it's only used here. */
function CreateSessionModal({
  onClose,
  onCreated,
  churchId,
  ministries,
  orgPrereqs,
}: {
  onClose: () => void;
  onCreated: () => void;
  churchId: string;
  ministries: Ministry[];
  orgPrereqs: OnboardingStep[];
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:30");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState<number>(0);
  // Combined prereq selector: "<ministry_id>::<step_id>" so we capture both.
  const [prereqKey, setPrereqKey] = useState("");
  const [autoComplete, setAutoComplete] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Build flattened prereq list: org-wide first, then per-ministry.
  const prereqOptions: { key: string; label: string }[] = [
    ...orgPrereqs.map((p) => ({
      key: `${ORG_WIDE_MINISTRY_ID}::${p.id}`,
      label: `Organization · ${p.label}`,
    })),
    ...ministries.flatMap((m) =>
      (m.prerequisites || []).map((p) => ({
        key: `${m.id}::${p.id}`,
        label: `${m.name} · ${p.label}`,
      })),
    ),
  ];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!prereqKey) {
      setFormError("Pick the prerequisite this session fulfills.");
      return;
    }
    const [ministryId, stepId] = prereqKey.split("::");
    setSubmitting(true);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/training-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          church_id: churchId,
          prerequisite_step_id: stepId,
          ministry_id: ministryId,
          title,
          date,
          start_time: startTime,
          end_time: endTime,
          location,
          capacity,
          auto_complete: autoComplete,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || `Failed to create (${res.status})`);
        return;
      }
      onCreated();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="New Training Session" maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="Title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Safe Sanctuary Training"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Input
            label="Capacity (0 = unlimited)"
            type="number"
            min={0}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value) || 0)}
          />
          <Input
            label="Start time"
            type="time"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
          <Input
            label="End time"
            type="time"
            required
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
        <Input
          label="Location"
          required
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Fellowship Hall"
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-vc-text">
            Fulfills prerequisite
          </label>
          {prereqOptions.length === 0 ? (
            <p className="text-xs text-vc-danger">
              No prerequisites configured yet. Add one on{" "}
              <Link href="/dashboard/onboarding" className="text-vc-coral underline">
                /dashboard/onboarding
              </Link>{" "}
              first.
            </p>
          ) : (
            <select
              required
              value={prereqKey}
              onChange={(e) => setPrereqKey(e.target.value)}
              className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
            >
              <option value="">— Pick a prerequisite —</option>
              {prereqOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-vc-text">
          <input
            type="checkbox"
            checked={autoComplete}
            onChange={(e) => setAutoComplete(e.target.checked)}
            className="h-4 w-4 rounded border-vc-border text-vc-coral focus:ring-vc-coral/30"
          />
          Mark attendees&apos; prerequisite complete when session is marked complete
        </label>
        {formError && (
          <p className="text-sm text-vc-danger">{formError}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={prereqOptions.length === 0}>
            Create session
          </Button>
        </div>
      </form>
    </Modal>
  );
}
