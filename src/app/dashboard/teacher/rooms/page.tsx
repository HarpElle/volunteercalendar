"use client";

/**
 * /dashboard/teacher/rooms — Wave 10 W10-2.
 *
 * Person-anchored teacher dashboard. The signed-in volunteer sees
 * the children in every room they're currently checked into — with
 * names, parent phone (masked), allergies (per `medical_visibility`),
 * and a ratio-status indicator per room.
 *
 * Auth: Bearer JWT (auth-context provides). Backed by
 * /api/teacher/dashboard which gates on Person + active
 * RoomVolunteerCheckIn.
 *
 * Auto-refresh: 30s polling. Tab visibility pauses the poll when
 * hidden to save battery on volunteer phones.
 *
 * Tap-to-reveal: NOT implemented in this v1. Fields the org has
 * configured as `expand_on_tap_only` render as "Hidden" placeholders.
 * The teacher can still see allergies that aren't gated; medications
 * / notes can be revealed by the kiosk operator at request. A
 * follow-up PR can add a Bearer-JWT reveal endpoint that mirrors
 * the kiosk-side `kiosk.medical_data_revealed` audit.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";

interface MedicalField {
  field: "allergies" | "medical_notes" | "medications";
  value: string | null;
  visible: boolean;
  requires_tap: boolean;
}

interface RoomChild {
  session_id: string;
  child_id: string;
  child_name: string;
  grade?: string;
  checked_in_at: string;
  has_alerts: boolean;
  allergies?: string;
  medical_notes?: string;
  medications?: string;
  medical_fields: MedicalField[];
  parent_phone_masked: string;
}

interface DashboardRoom {
  room: { id: string; name: string };
  children: RoomChild[];
  ratio: {
    status: "ok" | "warning" | "violation";
    message: string;
    children: number;
    volunteers: number;
    unrelated_adults: number;
    max_children_for_current_volunteers: number | null;
    two_deep_ok: boolean;
    ratio_ok: boolean;
  };
  total_checked_in: number;
}

interface DashboardData {
  teacher: { id: string; name: string };
  date: string;
  rooms: DashboardRoom[];
}

const POLL_INTERVAL_MS = 30_000;

export default function TeacherDashboardPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/teacher/dashboard?church_id=${encodeURIComponent(churchId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Could not load dashboard");
      }
      const body = (await res.json()) as DashboardData;
      setData(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user, churchId]);

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => {
      // Pause polling when tab is hidden — saves battery on volunteer
      // phones and prevents pointless audit emits.
      if (document.visibilityState === "visible") {
        void fetchData();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="rounded-xl border border-vc-danger/30 bg-vc-danger/5 p-5 text-vc-danger">
          <p className="font-medium">Could not load teacher dashboard</p>
          <p className="text-sm mt-1">{error}</p>
          <p className="text-sm mt-2 text-vc-text-secondary">
            If you&rsquo;re a new volunteer, your church admin needs to add
            you to the people list first.
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <Link
          href="/dashboard/account"
          className="text-sm text-vc-coral font-medium mb-2 inline-block"
        >
          ← Back to Account
        </Link>
        <h1 className="text-2xl font-display font-bold text-vc-indigo">
          My rooms today
        </h1>
        <p className="text-sm text-vc-text-secondary mt-1">
          {data.teacher.name} · {data.date}
        </p>
      </div>

      {data.rooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-vc-border-light bg-vc-bg-warm p-10 text-center">
          <p className="text-vc-indigo font-medium">
            You&rsquo;re not currently checked into a room.
          </p>
          <p className="text-sm text-vc-text-secondary mt-2">
            Stop by a staffed kiosk and ask the operator to check you in
            to your assigned room. This page will update automatically.
          </p>
        </div>
      ) : (
        data.rooms.map((roomData) => (
          <RoomCard key={roomData.room.id} data={roomData} />
        ))
      )}
    </div>
  );
}

function RoomCard({ data }: { data: DashboardRoom }) {
  const max = data.ratio.max_children_for_current_volunteers;

  const statusBadge = {
    ok: { bg: "bg-vc-sage/10", text: "text-vc-sage", label: "OK" },
    warning: { bg: "bg-amber-500/10", text: "text-amber-700", label: "Warning" },
    violation: { bg: "bg-vc-coral/10", text: "text-vc-coral", label: "Over" },
  }[data.ratio.status];

  return (
    <section className="rounded-2xl border border-vc-border-light bg-vc-bg p-5 space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-display font-semibold text-vc-indigo">
            {data.room.name}
          </h2>
          <p className="text-sm text-vc-text-secondary">
            {data.ratio.children} child
            {data.ratio.children === 1 ? "" : "ren"}
            {max !== null ? ` / ${max}` : ""} · {data.ratio.volunteers}{" "}
            volunteer{data.ratio.volunteers === 1 ? "" : "s"}
          </p>
        </div>
        <span
          className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full ${statusBadge.bg} ${statusBadge.text}`}
        >
          {statusBadge.label}
        </span>
      </div>

      {data.ratio.message && data.ratio.status !== "ok" && (
        <p className="text-sm text-vc-text-secondary">
          {data.ratio.message}
        </p>
      )}

      {data.children.length === 0 ? (
        <p className="text-sm text-vc-text-muted text-center py-4">
          No children checked in yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.children.map((c) => (
            <li
              key={c.session_id}
              className="rounded-xl bg-white border border-vc-border-light p-3 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="font-medium text-vc-indigo">
                    {c.child_name}
                  </p>
                  {c.grade && (
                    <span className="text-xs text-vc-text-muted">
                      ({c.grade})
                    </span>
                  )}
                  {c.has_alerts && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-vc-coral/10 text-vc-coral font-medium">
                      ⚠ Alert
                    </span>
                  )}
                </div>
                {c.allergies && (
                  <p className="text-sm text-vc-coral mt-1">
                    Allergies: {c.allergies}
                  </p>
                )}
                {c.medical_notes && (
                  <p className="text-sm text-amber-700 mt-1">
                    Notes: {c.medical_notes}
                  </p>
                )}
                {c.medications && (
                  <p className="text-sm text-vc-indigo mt-1">
                    Medications: {c.medications}
                  </p>
                )}
                {c.has_alerts &&
                  !c.allergies &&
                  !c.medical_notes &&
                  !c.medications && (
                    <p className="text-xs text-vc-text-muted mt-1 italic">
                      Medical details hidden — ask a kiosk operator to reveal
                    </p>
                  )}
                <p className="text-xs text-vc-text-muted mt-1">
                  Parent: {c.parent_phone_masked}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
