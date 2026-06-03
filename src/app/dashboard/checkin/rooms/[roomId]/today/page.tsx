"use client";

/**
 * Admin per-room "today" view.
 *
 * Surfaces the children + adults currently in a specific room for the
 * current service date. Powers the "click a room card → see who's in
 * it" UX gap Jason flagged 2026-06-02. Read-only — admin observes,
 * doesn't check anyone in/out from here.
 *
 * Auto-refreshes every 30s so the page stays accurate during service.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";

interface ChildRow {
  session_id: string;
  child_id: string;
  child_name: string;
  grade: string | null;
  checked_in_at: string;
  checked_out_at: string | null;
  allergies: string | null;
  medical_notes: string | null;
  medications: string | null;
  primary_guardian_name: string | null;
  primary_guardian_phone: string | null;
}

interface AdultRow {
  person_id: string;
  person_name: string;
  checked_in_at: string;
  checked_out_at: string | null;
}

interface RoomData {
  room: { id: string; name: string; capacity: number | null };
  date: string;
  children: ChildRow[];
  adults: AdultRow[];
  totals: {
    children_checked_in: number;
    children_checked_out: number;
    adults_present: number;
  };
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function AdminRoomTodayPage() {
  const router = useRouter();
  const params = useParams();
  const roomId = params?.roomId as string;
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;
  const [data, setData] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !churchId || !roomId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/room/${encodeURIComponent(roomId)}?church_id=${encodeURIComponent(churchId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Error ${res.status}`);
      }
      const json = (await res.json()) as RoomData;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user, churchId, roomId]);

  useEffect(() => {
    void load();
    // Auto-refresh every 30s while tab is visible. Skip while hidden
    // so a backgrounded tab doesn't burn the rate limit.
    const id = setInterval(() => {
      if (!document.hidden) void load();
    }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <button
          onClick={() => router.back()}
          className="text-sm font-medium text-vc-coral hover:text-vc-coral-dark"
        >
          ← Back
        </button>
        <div className="mt-4 rounded-xl border border-vc-danger/30 bg-vc-danger/5 p-6">
          <p className="font-display text-lg font-semibold text-vc-danger">
            Couldn&rsquo;t load this room
          </p>
          <p className="mt-2 text-sm text-vc-text-secondary">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const activeChildren = data.children.filter((c) => !c.checked_out_at);
  const activeAdults = data.adults.filter((a) => !a.checked_out_at);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Link
        href="/dashboard/checkin"
        className="text-sm font-medium text-vc-coral hover:text-vc-coral-dark"
      >
        ← Back to Check-In
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="font-display text-2xl font-bold text-vc-indigo">
          {data.room.name}
        </h1>
        <p className="mt-1 text-sm text-vc-text-secondary">
          {data.totals.children_checked_in} children present
          {data.room.capacity ? ` / ${data.room.capacity} capacity` : ""}{" "}
          &middot; {data.totals.adults_present} adult
          {data.totals.adults_present === 1 ? "" : "s"} on duty
          {data.totals.children_checked_out > 0 && (
            <> &middot; {data.totals.children_checked_out} checked out</>
          )}
        </p>
      </header>

      {/* Adults section */}
      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg font-semibold text-vc-indigo">
          Adults on duty ({activeAdults.length})
        </h2>
        {activeAdults.length === 0 ? (
          <div className="rounded-xl border border-dashed border-vc-coral/40 bg-vc-coral/5 p-4">
            <p className="text-sm text-vc-coral">
              ⚠️ No adults checked in to this room. Ratio policy is at risk.
            </p>
          </div>
        ) : (
          <ul className="rounded-xl border border-vc-border-light bg-white divide-y divide-vc-border-light">
            {activeAdults.map((a) => (
              <li
                key={a.person_id}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="text-sm font-medium text-vc-indigo">
                  {a.person_name}
                </span>
                <span className="text-xs text-vc-text-muted">
                  Since {formatTime(a.checked_in_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Children section */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-vc-indigo">
          Children present ({activeChildren.length})
        </h2>
        {activeChildren.length === 0 ? (
          <div className="rounded-xl border border-dashed border-vc-border bg-white p-8 text-center">
            <p className="text-sm text-vc-text-secondary">
              No children currently checked in.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {activeChildren.map((c) => {
              const hasMedical =
                !!c.allergies || !!c.medical_notes || !!c.medications;
              return (
                <li
                  key={c.session_id}
                  className="rounded-xl border border-vc-border-light bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-vc-indigo">
                        {c.child_name}
                        {c.grade && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-vc-indigo/5 px-2 py-0.5 text-xs font-medium text-vc-indigo">
                            {c.grade}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-vc-text-muted">
                        Checked in at {formatTime(c.checked_in_at)}
                      </p>
                      {c.primary_guardian_name && (
                        <p className="mt-1 text-sm text-vc-text-secondary">
                          Parent: {c.primary_guardian_name}
                          {c.primary_guardian_phone && (
                            <>
                              {" "}
                              &middot;{" "}
                              <a
                                href={`tel:${c.primary_guardian_phone}`}
                                className="text-vc-coral hover:underline"
                              >
                                {c.primary_guardian_phone}
                              </a>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                    {hasMedical && (
                      <span className="rounded-full bg-vc-coral/10 px-2.5 py-0.5 text-xs font-medium text-vc-coral whitespace-nowrap">
                        Medical alert
                      </span>
                    )}
                  </div>
                  {hasMedical && (
                    <div className="mt-3 rounded-lg bg-vc-coral/5 border border-vc-coral/20 p-3 text-sm text-vc-text">
                      {c.allergies && (
                        <p>
                          <strong className="text-vc-coral">Allergies:</strong>{" "}
                          {c.allergies}
                        </p>
                      )}
                      {c.medications && (
                        <p className="mt-1">
                          <strong className="text-vc-coral">Medications:</strong>{" "}
                          {c.medications}
                        </p>
                      )}
                      {c.medical_notes && (
                        <p className="mt-1">
                          <strong className="text-vc-coral">Notes:</strong>{" "}
                          {c.medical_notes}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
