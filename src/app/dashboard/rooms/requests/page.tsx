"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

interface RequestItem {
  id: string;
  new_reservation_id: string;
  conflicting_reservation_ids: string[];
  status: "pending" | "approved" | "denied";
  admin_note?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  reservation?: {
    id: string;
    title: string;
    room_id: string;
    date: string;
    start_time: string;
    end_time: string;
    requested_by_name: string;
    room_name?: string;
  };
}

export default function RoomRequestsPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState<Record<string, string>>({});

  const fetchRequests = useCallback(async () => {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/reservations/requests?church_id=${encodeURIComponent(churchId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setRequests(json.requests || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, churchId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  async function handleAction(
    requestId: string,
    action: "approve" | "deny",
  ) {
    if (!user || !churchId) return;
    setProcessingId(requestId);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/reservations/requests/${requestId}/${action}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            church_id: churchId,
            admin_note: noteInput[requestId] || undefined,
          }),
        },
      );
      if (res.ok) {
        fetchRequests();
      }
    } catch {
      // silent
    } finally {
      setProcessingId(null);
    }
  }

  function formatTime12(time24: string): string {
    const [h, m] = time24.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
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

      {requests.length === 0 ? (
        <EmptyState
          title="No pending requests"
          description="All reservation requests have been reviewed."
        />
      ) : (
        <div className="space-y-4">
          {requests.map((req) => {
            const r = req.reservation;
            return (
              <div
                key={req.id}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-vc-indigo font-display">
                      {r?.title || "Reservation"}
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Requested by {r?.requested_by_name || "Unknown"}
                    </p>
                  </div>
                  <Badge variant="warning">Pending</Badge>
                </div>

                {r && (
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-3">
                    <span>
                      {new Date(r.date + "T12:00:00").toLocaleDateString(
                        undefined,
                        {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </span>
                    <span>
                      {formatTime12(r.start_time)} &ndash;{" "}
                      {formatTime12(r.end_time)}
                    </span>
                    {r.room_name && <span>{r.room_name}</span>}
                  </div>
                )}

                {req.conflicting_reservation_ids.length > 0 && (
                  <p className="text-sm text-amber-600 mb-3">
                    Conflicts with {req.conflicting_reservation_ids.length}{" "}
                    existing reservation
                    {req.conflicting_reservation_ids.length > 1 ? "s" : ""}
                  </p>
                )}

                {/* Admin note input */}
                <div className="mb-3">
                  <input
                    type="text"
                    value={noteInput[req.id] || ""}
                    onChange={(e) =>
                      setNoteInput((prev) => ({
                        ...prev,
                        [req.id]: e.target.value,
                      }))
                    }
                    placeholder="Add a note (optional)"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleAction(req.id, "approve")}
                    disabled={processingId === req.id}
                    className="rounded-lg bg-vc-sage px-4 py-2 text-sm font-medium text-white hover:bg-vc-sage/90 transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    {processingId === req.id ? "..." : "Approve"}
                  </button>
                  <button
                    onClick={() => handleAction(req.id, "deny")}
                    disabled={processingId === req.id}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    Deny
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
