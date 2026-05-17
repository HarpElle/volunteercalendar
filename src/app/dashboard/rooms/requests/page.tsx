"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

interface EmbeddedReservation {
  id: string;
  title: string;
  room_id: string;
  room_name: string | null;
  date: string;
  start_time: string;
  end_time: string;
  requested_by_name: string;
  is_recurring: boolean;
  recurrence_group_id: string | null;
  attendee_count: number | null;
  setup_notes: string;
  description: string;
  equipment_requested: string[];
  status: string;
}

interface EmbeddedConflict {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  requested_by_name: string;
}

interface RequestItem {
  id: string;
  new_reservation_id: string;
  conflicting_reservation_ids: string[];
  status: "pending" | "approved" | "denied";
  reason?: "conflict" | "approval_required";
  recurrence_group_id?: string;
  admin_note?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  /** Embedded by the API since PR #20 — older clients used a parallel
   *  reservations[] array. */
  reservation?: EmbeddedReservation;
  conflicts?: EmbeddedConflict[];
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

function formatDate(date: string): string {
  return new Date(date + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function RoomRequestsPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<
    { mode: "approve" | "deny"; request: RequestItem } | null
  >(null);
  const [noteInput, setNoteInput] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!user || !churchId) return;
    setLoadError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/reservations/requests?church_id=${encodeURIComponent(churchId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setRequests(json.requests || []);
      } else {
        const data = await res.json().catch(() => ({}));
        setLoadError(
          data.error || `Failed to load requests (${res.status})`,
        );
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [user, churchId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  function openConfirm(mode: "approve" | "deny", request: RequestItem) {
    setActionTarget({ mode, request });
    setNoteInput("");
    setActionError(null);
  }

  async function submitAction() {
    if (!user || !churchId || !actionTarget) return;
    const { mode, request } = actionTarget;
    setProcessingId(request.id);
    setActionError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/reservations/requests/${request.id}/${mode}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            church_id: churchId,
            admin_note: noteInput.trim() || undefined,
          }),
        },
      );
      if (res.ok) {
        setActionTarget(null);
        fetchRequests();
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError(
          data.error || `${mode === "approve" ? "Approve" : "Deny"} failed (${res.status})`,
        );
      }
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : `Failed to ${mode === "approve" ? "approve" : "deny"} request`,
      );
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vc-indigo font-display">
          Reservation Requests
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Review and approve pending room reservation requests
        </p>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {!loadError && requests.length === 0 ? (
        <EmptyState
          title="No pending requests"
          description="All reservation requests have been reviewed."
        />
      ) : !loadError && requests.length > 0 ? (
        <div className="space-y-4">
          {requests.map((req) => {
            const r = req.reservation;
            const conflicts = req.conflicts || [];
            const reason = req.reason || "approval_required";
            return (
              <div
                key={req.id}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-vc-indigo font-display truncate">
                        {r?.title || "(reservation missing)"}
                      </h3>
                      {r?.is_recurring && (
                        <Badge variant="default">Recurring</Badge>
                      )}
                      <Badge
                        variant={reason === "conflict" ? "warning" : "default"}
                      >
                        {reason === "conflict"
                          ? "Conflict"
                          : "Approval required"}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Requested by{" "}
                      <span className="text-vc-indigo">
                        {r?.requested_by_name || "Unknown"}
                      </span>
                    </p>
                  </div>
                  <Badge variant="warning">Pending</Badge>
                </div>

                {r && (
                  <div className="grid gap-y-1 gap-x-4 grid-cols-[max-content_1fr] text-sm text-gray-700 mb-3">
                    <span className="text-gray-400">Room</span>
                    <span className="font-medium text-vc-indigo">
                      {r.room_name || r.room_id}
                    </span>
                    <span className="text-gray-400">Date</span>
                    <span>{formatDate(r.date)}</span>
                    <span className="text-gray-400">Time</span>
                    <span>
                      {formatTime12(r.start_time)} &ndash;{" "}
                      {formatTime12(r.end_time)}
                    </span>
                    {r.is_recurring && (
                      <>
                        <span className="text-gray-400">Series</span>
                        <span className="text-gray-600">
                          One approve/deny applies to every occurrence in this
                          series.
                        </span>
                      </>
                    )}
                    {r.attendee_count != null && (
                      <>
                        <span className="text-gray-400">Attendees</span>
                        <span>{r.attendee_count}</span>
                      </>
                    )}
                    {r.equipment_requested.length > 0 && (
                      <>
                        <span className="text-gray-400">Equipment</span>
                        <span>{r.equipment_requested.join(", ")}</span>
                      </>
                    )}
                    {r.description && (
                      <>
                        <span className="text-gray-400">Description</span>
                        <span className="text-gray-600">{r.description}</span>
                      </>
                    )}
                    {r.setup_notes && (
                      <>
                        <span className="text-gray-400">Setup notes</span>
                        <span className="text-gray-600">{r.setup_notes}</span>
                      </>
                    )}
                  </div>
                )}

                {conflicts.length > 0 && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                    <p className="font-medium text-amber-900 mb-1">
                      Conflicts with {conflicts.length}{" "}
                      existing reservation{conflicts.length > 1 ? "s" : ""}:
                    </p>
                    <ul className="space-y-0.5">
                      {conflicts.map((c) => (
                        <li
                          key={c.id}
                          className="text-amber-900/90"
                        >
                          <span className="font-medium">{c.title}</span> ·{" "}
                          {formatDate(c.date)} · {formatTime12(c.start_time)}
                          &ndash;{formatTime12(c.end_time)} ·{" "}
                          {c.requested_by_name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => openConfirm("approve", req)}
                    disabled={processingId === req.id}
                    className="rounded-lg bg-vc-sage px-4 py-2 text-sm font-medium text-white hover:bg-vc-sage/90 transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => openConfirm("deny", req)}
                    disabled={processingId === req.id}
                    className="rounded-lg border border-red-300 text-red-700 px-4 py-2 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    Deny
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Confirmation modal — required before any approve/deny lands. Codex
          PR #19 feedback: the inline note field + immediate Deny made it
          unsafe to mistakenly click the wrong row. The modal is the
          gatekeeper. */}
      {actionTarget && (
        <ConfirmModal
          mode={actionTarget.mode}
          request={actionTarget.request}
          note={noteInput}
          onNoteChange={setNoteInput}
          submitting={processingId === actionTarget.request.id}
          error={actionError}
          onCancel={() => {
            setActionTarget(null);
            setActionError(null);
          }}
          onConfirm={submitAction}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation modal
// ---------------------------------------------------------------------------

interface ConfirmModalProps {
  mode: "approve" | "deny";
  request: RequestItem;
  note: string;
  onNoteChange: (value: string) => void;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmModal({
  mode,
  request,
  note,
  onNoteChange,
  submitting,
  error,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const r = request.reservation;
  const isDeny = mode === "deny";
  const title = isDeny ? "Deny reservation request" : "Approve reservation request";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl mx-4">
        <h2 className="text-lg font-bold text-vc-indigo font-display mb-1">
          {title}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {r ? (
            <>
              <span className="font-medium text-vc-indigo">{r.title}</span> · {r.room_name || r.room_id} · {formatDate(r.date)} · {formatTime12(r.start_time)}–{formatTime12(r.end_time)} · {r.requested_by_name}
              {r.is_recurring && " · entire series"}
            </>
          ) : (
            "Reservation details unavailable."
          )}
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Note {isDeny ? "(recommended)" : "(optional)"}
          </label>
          <textarea
            autoFocus
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={3}
            placeholder={
              isDeny
                ? "Why is this request being denied? Sent to the requester."
                : "Anything to tell the requester? Sent with the approval."
            }
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none resize-none"
          />
        </div>

        {isDeny && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            This will set the reservation status to{" "}
            <span className="font-medium">denied</span>
            {r?.is_recurring ? " for every occurrence in the series" : ""}. The
            requester will be notified by SMS if a phone is on file.
          </p>
        )}

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
              isDeny
                ? "bg-red-600 hover:bg-red-700"
                : "bg-vc-sage hover:bg-vc-sage/90"
            }`}
          >
            {submitting
              ? "Working..."
              : isDeny
                ? "Deny request"
                : "Approve request"}
          </button>
        </div>
      </div>
    </div>
  );
}
