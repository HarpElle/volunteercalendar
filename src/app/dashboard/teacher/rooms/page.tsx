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
import type { User } from "firebase/auth";

const PAGE_COOLDOWN_MS = 60_000;

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
  /** Wave 10 (Jason 2026-06-02): parent signaled arrival at kiosk. */
  pickup_ready_at: string | null;
  /** Wave 10 (Jason 2026-06-02): teacher ack'd the ping. */
  pickup_acknowledged_at: string | null;
  /** Wave 10 (Jason 2026-06-02): user_id of the ack-ing teacher. */
  pickup_acknowledged_by: string | null;
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
          <RoomCard
            key={roomData.room.id}
            data={roomData}
            user={user}
            churchId={churchId!}
          />
        ))
      )}
    </div>
  );
}

function RoomCard({
  data,
  user,
  churchId,
}: {
  data: DashboardRoom;
  user: User | null;
  churchId: string;
}) {
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
            <ChildRow
              key={c.session_id}
              child={c}
              user={user}
              churchId={churchId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ChildRow({
  child,
  user,
  churchId,
}: {
  child: RoomChild;
  user: User | null;
  churchId: string;
}) {
  const [pageModalOpen, setPageModalOpen] = useState(false);
  const [lastPagedAt, setLastPagedAt] = useState<number | null>(null);
  // `cooldownSecs` is driven from inside an effect (where Date.now() is
  // allowed) so the render path stays pure.
  const [cooldownSecs, setCooldownSecs] = useState(0);

  useEffect(() => {
    if (lastPagedAt === null) {
      setCooldownSecs(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(
        0,
        PAGE_COOLDOWN_MS - (Date.now() - lastPagedAt),
      );
      setCooldownSecs(Math.ceil(remaining / 1000));
      return remaining;
    };
    if (tick() === 0) return;
    const interval = setInterval(() => {
      if (tick() === 0) clearInterval(interval);
    }, 1_000);
    return () => clearInterval(interval);
  }, [lastPagedAt]);

  const inCooldown = cooldownSecs > 0;

  const pickupReady =
    !!child.pickup_ready_at && !child.pickup_acknowledged_at;
  const pickupAcked =
    !!child.pickup_ready_at && !!child.pickup_acknowledged_at;
  const [ackPending, setAckPending] = useState(false);
  const handleAck = useCallback(async () => {
    if (!user) return;
    setAckPending(true);
    try {
      const token = await user.getIdToken();
      await fetch("/api/teacher/pickup-ack", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          church_id: churchId,
          session_id: child.session_id,
        }),
      });
      // Let the 30s poll refresh the row state. We don't optimistic-
      // update here because other teachers may be racing — the poll
      // resolves any conflict deterministically.
    } catch {
      // silent
    } finally {
      setAckPending(false);
    }
  }, [user, churchId, child.session_id]);

  return (
    <li
      className={`rounded-xl border p-3 flex items-start gap-3 transition-colors ${
        pickupReady
          ? "bg-vc-coral/10 border-vc-coral/40 ring-2 ring-vc-coral/30"
          : pickupAcked
            ? "bg-vc-sage/5 border-vc-sage/30"
            : "bg-white border-vc-border-light"
      }`}
    >
      <div className="flex-1 min-w-0">
        {pickupReady && (
          <p className="text-xs font-semibold text-vc-coral mb-1 uppercase tracking-wide">
            ⚠ Parent here for pickup
          </p>
        )}
        {pickupAcked && (
          <p className="text-xs font-medium text-vc-sage mb-1">
            ✓ Acknowledged — bring child to lobby
          </p>
        )}
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="font-medium text-vc-indigo">{child.child_name}</p>
          {child.grade && (
            <span className="text-xs text-vc-text-muted">({child.grade})</span>
          )}
          {child.has_alerts && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-vc-coral/10 text-vc-coral font-medium">
              ⚠ Alert
            </span>
          )}
        </div>
        {child.allergies && (
          <p className="text-sm text-vc-coral mt-1">
            Allergies: {child.allergies}
          </p>
        )}
        {child.medical_notes && (
          <p className="text-sm text-amber-700 mt-1">
            Notes: {child.medical_notes}
          </p>
        )}
        {child.medications && (
          <p className="text-sm text-vc-indigo mt-1">
            Medications: {child.medications}
          </p>
        )}
        {child.has_alerts &&
          !child.allergies &&
          !child.medical_notes &&
          !child.medications && (
            <p className="text-xs text-vc-text-muted mt-1 italic">
              Medical details hidden — ask a kiosk operator to reveal
            </p>
          )}
        <p className="text-xs text-vc-text-muted mt-1">
          Parent: {child.parent_phone_masked}
        </p>
      </div>
      {pickupReady && (
        <button
          type="button"
          onClick={handleAck}
          disabled={ackPending}
          className="text-sm font-semibold px-3 py-2 rounded-lg bg-vc-sage text-white disabled:bg-vc-text-muted disabled:cursor-not-allowed min-w-[100px] min-h-[44px] mr-2"
          aria-label={`Acknowledge pickup ready for ${child.child_name}`}
        >
          {ackPending ? "..." : "On my way"}
        </button>
      )}
      <button
        type="button"
        onClick={() => setPageModalOpen(true)}
        disabled={inCooldown}
        className="text-sm font-medium px-3 py-2 rounded-lg bg-vc-coral text-white disabled:bg-vc-text-muted disabled:cursor-not-allowed min-w-[88px] min-h-[44px]"
        aria-label={`Page parent for ${child.child_name}`}
      >
        {inCooldown ? `Sent · ${cooldownSecs}s` : "Page parent"}
      </button>

      {pageModalOpen && (
        <PageParentModal
          child={child}
          user={user}
          churchId={churchId}
          onClose={() => setPageModalOpen(false)}
          onSent={() => {
            setLastPagedAt(Date.now());
            setPageModalOpen(false);
          }}
        />
      )}
    </li>
  );
}

function PageParentModal({
  child,
  user,
  churchId,
  onClose,
  onSent,
}: {
  child: RoomChild;
  user: User | null;
  churchId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async () => {
    if (!user) {
      setError("Sign-in expired. Please reload.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/teacher/page-parent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          church_id: churchId,
          session_id: child.session_id,
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Could not send page");
      }
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }, [user, churchId, child.session_id, note, onSent]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="page-parent-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-vc-indigo/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3
            id="page-parent-title"
            className="text-lg font-display font-semibold text-vc-indigo"
          >
            Page parent for {child.child_name}
          </h3>
          <p className="text-sm text-vc-text-secondary mt-1">
            We&rsquo;ll text the primary guardian and any pickup recipients
            checked in for this session. The text identifies you and the room.
          </p>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-vc-indigo">
            Optional note
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            rows={3}
            placeholder="e.g. needs a diaper change, very upset, ran out of snack"
            className="mt-1 w-full rounded-lg border border-vc-border-light bg-vc-bg-warm p-2 text-sm"
          />
          <span className="text-xs text-vc-text-muted">
            {note.length}/200
          </span>
        </label>
        {error && (
          <p
            role="alert"
            className="text-sm text-vc-danger bg-vc-danger/5 border border-vc-danger/20 rounded-lg p-2"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 rounded-lg border border-vc-border-light text-vc-indigo min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="px-4 py-2 rounded-lg bg-vc-coral text-white font-medium min-h-[44px] min-w-[88px]"
          >
            {sending ? "Sending…" : "Send page"}
          </button>
        </div>
      </div>
    </div>
  );
}
