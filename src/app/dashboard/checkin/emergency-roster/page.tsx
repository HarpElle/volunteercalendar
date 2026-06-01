"use client";

/**
 * /dashboard/checkin/emergency-roster — Wave 10 W10-4.
 *
 * Admin-only evacuation roster. The "break glass" surface: every
 * checked-in child across the campus, grouped by room, with full
 * medical + parent contact data, suitable for printing on paper
 * and handing to the evacuation marshal.
 *
 * UX flow:
 *   1. Page mounts → consent modal (reveals what the page does and
 *      that the access is audited). Optional `reason` text field
 *      that joins the audit row.
 *   2. Admin confirms → /api/admin/emergency-roster fetch.
 *   3. Roster renders with one "Mark accounted for" checkbox per
 *      child (clientside only, not persisted — it's a printing /
 *      head-counting aid).
 *   4. "Print" button triggers window.print() with a screen→print
 *      stylesheet that strips chrome and lays the roster out for
 *      A4/Letter with page-break-inside avoid per room.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";

interface RosterChild {
  session_id: string;
  child_id: string;
  child_name: string;
  grade?: string;
  checked_in_at: string;
  has_alerts: boolean;
  allergies: string | null;
  medical_notes: string | null;
  medications: string | null;
  parent: { name: string | null; phone: string | null };
  authorized_pickups: Array<{
    name: string;
    relationship: string | null;
    phone: string | null;
  }>;
  household_id: string;
}

interface RosterRoom {
  room: { id: string; name: string };
  children: RosterChild[];
}

interface RosterData {
  generated_at: string;
  date: string;
  church_name: string;
  total_children: number;
  total_rooms: number;
  rooms: RosterRoom[];
  unroomed: RosterChild[];
}

export default function EmergencyRosterPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState("");
  const [data, setData] = useState<RosterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Clientside-only checklist of which children the marshal has
  // confirmed present. Resets on reload (this is a help aid, not
  // a persisted record).
  const [accountedFor, setAccountedFor] = useState<Set<string>>(new Set());

  const fetchRoster = useCallback(async () => {
    if (!user || !churchId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ church_id: churchId });
      if (reason.trim()) params.set("reason", reason.trim());
      const res = await fetch(
        `/api/admin/emergency-roster?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Could not load roster");
      }
      const body = (await res.json()) as RosterData;
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user, churchId, reason]);

  useEffect(() => {
    if (acknowledged) void fetchRoster();
  }, [acknowledged, fetchRoster]);

  const toggleAccounted = (sessionId: string) =>
    setAccountedFor((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });

  if (!acknowledged) {
    return (
      <ConsentScreen
        reason={reason}
        onReasonChange={setReason}
        onConfirm={() => setAcknowledged(true)}
      />
    );
  }

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
          <p className="font-medium">Could not load emergency roster</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
        <button
          type="button"
          onClick={fetchRoster}
          className="mt-4 px-4 py-2 rounded-lg bg-vc-coral text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  const accountedCount = accountedFor.size;

  return (
    <>
      <style jsx global>{`
        @media print {
          /* Strip dashboard chrome on print. The page selectors are
             defensive — the sidebar / header may have changed names
             but display:none on the most likely candidates leaves the
             actual roster intact. */
          nav,
          aside,
          header[class*="sidebar"],
          [data-noprint] {
            display: none !important;
          }
          body,
          main {
            background: white !important;
            color: black !important;
          }
          .er-print-only {
            display: block !important;
          }
          .er-screen-only {
            display: none !important;
          }
          .er-room-section {
            page-break-inside: avoid;
          }
          .er-child-row {
            page-break-inside: avoid;
          }
        }
        .er-print-only {
          display: none;
        }
      `}</style>

      <div className="max-w-5xl mx-auto p-6 space-y-6 print:p-0 print:max-w-none">
        <div
          className="flex items-start justify-between gap-4 flex-wrap er-screen-only"
          data-noprint
        >
          <div>
            <Link
              href="/dashboard/checkin"
              className="text-sm text-vc-coral font-medium mb-2 inline-block"
            >
              ← Back to Check-In
            </Link>
            <h1 className="text-2xl font-display font-bold text-vc-indigo">
              Emergency roster
            </h1>
            <p className="text-sm text-vc-text-secondary mt-1">
              {data.church_name} · {data.date} · Generated{" "}
              {new Date(data.generated_at).toLocaleTimeString()}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={fetchRoster}
              className="px-4 py-2 rounded-lg border border-vc-border-light text-vc-indigo min-h-[44px]"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-lg bg-vc-coral text-white font-medium min-h-[44px]"
            >
              Print
            </button>
          </div>
        </div>

        {/* Print-only header so the printed page identifies itself. */}
        <div className="er-print-only border-b border-black pb-2 mb-4">
          <h1 className="text-2xl font-bold">
            EMERGENCY ROSTER — {data.church_name}
          </h1>
          <p>
            Date {data.date} · Generated{" "}
            {new Date(data.generated_at).toLocaleString()} ·{" "}
            {data.total_children} children · {data.total_rooms} rooms
          </p>
        </div>

        <div
          className="rounded-2xl border border-vc-border-light bg-vc-bg-warm p-4 flex justify-between flex-wrap gap-2 er-screen-only"
          data-noprint
        >
          <p className="text-sm text-vc-indigo">
            <strong>{data.total_children}</strong> children across{" "}
            <strong>{data.total_rooms}</strong> rooms
          </p>
          <p className="text-sm text-vc-indigo">
            Accounted for: <strong>{accountedCount}</strong> /{" "}
            {data.total_children}
          </p>
        </div>

        {data.total_children === 0 ? (
          <div className="rounded-2xl border border-dashed border-vc-border-light bg-vc-bg-warm p-10 text-center">
            <p className="text-vc-indigo font-medium">
              No children are currently checked in.
            </p>
          </div>
        ) : (
          <>
            {data.rooms.map((roomData) => (
              <RoomSection
                key={roomData.room.id}
                data={roomData}
                accountedFor={accountedFor}
                onToggle={toggleAccounted}
              />
            ))}
            {data.unroomed.length > 0 && (
              <RoomSection
                data={{
                  room: { id: "__unroomed__", name: "Unassigned (no room)" },
                  children: data.unroomed,
                }}
                accountedFor={accountedFor}
                onToggle={toggleAccounted}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

function ConsentScreen({
  reason,
  onReasonChange,
  onConfirm,
}: {
  reason: string;
  onReasonChange: (v: string) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <Link
        href="/dashboard/checkin"
        className="text-sm text-vc-coral font-medium inline-block"
      >
        ← Back to Check-In
      </Link>
      <div className="rounded-2xl border border-vc-coral/30 bg-vc-coral/5 p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-vc-indigo">
            Emergency roster
          </h1>
          <p className="text-sm text-vc-text-secondary mt-2">
            This page shows the full name, medical alerts, allergies,
            medications, parent name, and parent phone for every child
            currently checked in across all rooms — regardless of the
            org&rsquo;s normal medical-data display preferences.
          </p>
        </div>
        <div className="rounded-xl bg-white border border-vc-coral/30 p-4">
          <p className="text-sm font-medium text-vc-indigo">
            Use this only for:
          </p>
          <ul className="text-sm text-vc-text-secondary mt-1 list-disc list-inside">
            <li>Evacuation / fire drill</li>
            <li>Lockdown response</li>
            <li>Severe weather shelter-in-place</li>
            <li>Missing-child search</li>
          </ul>
        </div>
        <p className="text-sm text-vc-text-secondary">
          Every access is logged with your account, the date, and the
          reason you provide. Compliance staff review these logs.
        </p>
        <label className="block">
          <span className="text-sm font-medium text-vc-indigo">
            Reason for access (recommended)
          </span>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            maxLength={280}
            rows={3}
            placeholder="e.g. Fire alarm activated at 10:32; evacuating to parking lot."
            className="mt-1 w-full rounded-lg border border-vc-border-light bg-white p-2 text-sm"
          />
          <span className="text-xs text-vc-text-muted">
            {reason.length}/280
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Link
            href="/dashboard/checkin"
            className="px-4 py-2 rounded-lg border border-vc-border-light text-vc-indigo min-h-[44px] flex items-center"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-vc-coral text-white font-medium min-h-[44px] min-w-[120px]"
          >
            I understand, show roster
          </button>
        </div>
      </div>
    </div>
  );
}

function RoomSection({
  data,
  accountedFor,
  onToggle,
}: {
  data: RosterRoom;
  accountedFor: Set<string>;
  onToggle: (sessionId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-vc-border-light bg-vc-bg p-5 space-y-3 er-room-section print:border-2 print:border-black print:rounded-none print:p-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-display font-bold text-vc-indigo print:text-black print:text-lg">
          {data.room.name}
        </h2>
        <p className="text-sm text-vc-text-secondary print:text-black">
          {data.children.length} child
          {data.children.length === 1 ? "" : "ren"}
        </p>
      </div>
      <ul className="space-y-2">
        {data.children.map((c) => (
          <li
            key={c.session_id}
            className="rounded-xl bg-white border border-vc-border-light p-3 flex items-start gap-3 er-child-row print:border print:border-black print:rounded-none print:p-2"
          >
            <input
              type="checkbox"
              checked={accountedFor.has(c.session_id)}
              onChange={() => onToggle(c.session_id)}
              aria-label={`Mark ${c.child_name} accounted for`}
              className="mt-1 w-5 h-5 accent-vc-sage"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="font-bold text-vc-indigo print:text-black">
                  {c.child_name}
                </p>
                {c.grade && (
                  <span className="text-xs text-vc-text-muted print:text-black">
                    ({c.grade})
                  </span>
                )}
                {c.has_alerts && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-vc-coral/10 text-vc-coral font-medium print:bg-white print:border print:border-black print:text-black">
                    ⚠ ALERT
                  </span>
                )}
              </div>
              {c.allergies && (
                <p className="text-sm text-vc-coral mt-1 print:text-black">
                  <strong>Allergies:</strong> {c.allergies}
                </p>
              )}
              {c.medical_notes && (
                <p className="text-sm text-amber-700 mt-1 print:text-black">
                  <strong>Notes:</strong> {c.medical_notes}
                </p>
              )}
              {c.medications && (
                <p className="text-sm text-vc-indigo mt-1 print:text-black">
                  <strong>Medications:</strong> {c.medications}
                </p>
              )}
              <p className="text-sm text-vc-text-secondary mt-1 print:text-black">
                <strong>Parent:</strong>{" "}
                {c.parent.name ? `${c.parent.name} · ` : ""}
                {c.parent.phone ?? "no phone on file"}
              </p>
              {c.authorized_pickups.length > 0 && (
                <p className="text-xs text-vc-text-muted mt-1 print:text-black">
                  <strong>Other authorized pickup:</strong>{" "}
                  {c.authorized_pickups
                    .map((p) =>
                      [
                        p.name,
                        p.relationship,
                        p.phone,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    )
                    .join(" | ")}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
