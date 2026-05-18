"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { where } from "firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { isScheduler } from "@/lib/utils/permissions";
import { ORG_WIDE_MINISTRY_ID } from "@/lib/types";
import type {
  Person,
  Ministry,
  TrainingSession,
  TrainingSessionRsvp,
} from "@/lib/types";

/**
 * /dashboard/training-sessions/[id] — admin detail page.
 *
 *  - Session info
 *  - "Send Invitations" button → POST /invite
 *  - RSVP roster (accepted / declined / no response)
 *  - Mark Complete flow: per-volunteer attendance checkboxes, then
 *    POST /complete with the chosen attendee IDs. Auto-completes the
 *    linked prerequisite for each attendee.
 *  - Cancel session button → DELETE
 */
export default function TrainingSessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const { user, profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;
  const canManage = isScheduler(activeMembership);
  const { confirm } = useConfirm();

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [ministry, setMinistry] = useState<Ministry | null>(null);
  const [volunteers, setVolunteers] = useState<Person[]>([]);
  const [prereqLabel, setPrereqLabel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  // Attendance checkboxes for Mark Complete. Pre-populated from accepted
  // RSVPs once the session loads.
  const [attendedIds, setAttendedIds] = useState<Set<string>>(new Set());
  const [showCompleteUI, setShowCompleteUI] = useState(false);

  const loadAll = useCallback(async () => {
    if (!churchId || !user) return;
    setError(null);
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const sessRes = await fetch(
        `/api/training-sessions/${sessionId}?church_id=${encodeURIComponent(churchId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!sessRes.ok) {
        const data = await sessRes.json().catch(() => ({}));
        setError(data.error || `Failed to load session (${sessRes.status})`);
        setLoading(false);
        return;
      }
      const data = (await sessRes.json()) as { session: TrainingSession };
      const sess = data.session;
      setSession(sess);
      setAttendedIds(
        new Set(
          sess.attendee_ids?.length
            ? sess.attendee_ids
            : (sess.rsvps || [])
                .filter((r) => r.status === "accepted")
                .map((r) => r.volunteer_id),
        ),
      );

      // Load ministry (or skip for org-wide) + volunteers + church doc for prereq label
      const [vols, mins, churchDocs] = await Promise.all([
        getChurchDocuments(churchId, "people",
          where("is_volunteer", "==", true),
          where("status", "==", "active"),
        ) as Promise<unknown[]>,
        sess.ministry_id === ORG_WIDE_MINISTRY_ID
          ? Promise.resolve([] as unknown[])
          : (getChurchDocuments(churchId, "ministries") as Promise<unknown[]>),
        // Need org_prerequisites to resolve the prereq label if it's org-wide
        (async () => {
          const { getDoc, doc } = await import("firebase/firestore");
          const { db } = await import("@/lib/firebase/config");
          return await getDoc(doc(db, "churches", churchId));
        })(),
      ]);
      setVolunteers(vols as Person[]);

      const min =
        sess.ministry_id === ORG_WIDE_MINISTRY_ID
          ? null
          : (mins as Ministry[]).find((m) => m.id === sess.ministry_id) || null;
      setMinistry(min);

      // Resolve prereq label
      if (sess.ministry_id === ORG_WIDE_MINISTRY_ID) {
        const orgPrereqs =
          (churchDocs.exists() && (churchDocs.data().org_prerequisites as Array<{ id: string; label: string }>)) || [];
        setPrereqLabel(
          orgPrereqs.find((p) => p.id === sess.prerequisite_step_id)?.label || sess.prerequisite_step_id,
        );
      } else if (min) {
        setPrereqLabel(
          (min.prerequisites || []).find((p) => p.id === sess.prerequisite_step_id)?.label ||
            sess.prerequisite_step_id,
        );
      }
    } catch {
      setError("Failed to load session.");
    } finally {
      setLoading(false);
    }
  }, [churchId, user, sessionId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleInvite() {
    if (!user || !churchId || !session) return;
    setInviting(true);
    setActionMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/training-sessions/${sessionId}/invite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ church_id: churchId }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Failed to send invites (${res.status})`);
        return;
      }
      setActionMessage(
        data.sent === 0
          ? "No invitations sent — everyone either already RSVP'd or has the prerequisite cleared."
          : `Sent ${data.sent} invitation${data.sent !== 1 ? "s" : ""}${data.skipped > 0 ? ` (${data.skipped} skipped)` : ""}.`,
      );
    } catch {
      setError("Network error sending invitations.");
    } finally {
      setInviting(false);
    }
  }

  async function handleMarkComplete() {
    if (!user || !churchId || !session) return;
    const attended = [...attendedIds];
    const ok = await confirm({
      title: "Mark session complete?",
      message:
        attended.length === 0
          ? "No attendees checked. Continue anyway? The session will be marked complete with zero attendees."
          : `${attended.length} attendee${attended.length !== 1 ? "s" : ""} will have their "${prereqLabel}" prerequisite marked complete${session.auto_complete ? "" : " — but this session is set to NOT auto-complete, so journey steps will be left untouched"}.`,
      confirmLabel: "Mark complete",
    });
    if (!ok) return;
    setCompleting(true);
    setActionMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/training-sessions/${sessionId}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ church_id: churchId, attendee_ids: attended }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Failed to complete session (${res.status})`);
        return;
      }
      setActionMessage(
        `Session marked complete. ${data.attendees_marked} attendee${data.attendees_marked !== 1 ? "s" : ""}; ${data.steps_completed} prerequisite step${data.steps_completed !== 1 ? "s" : ""} auto-completed.`,
      );
      await loadAll();
      setShowCompleteUI(false);
    } catch {
      setError("Network error marking session complete.");
    } finally {
      setCompleting(false);
    }
  }

  async function handleCancel() {
    if (!user || !churchId || !session) return;
    const ok = await confirm({
      title: "Cancel this session?",
      message:
        "The session will be deleted. Volunteers who already RSVP'd will NOT receive an automatic cancellation email — you'll want to notify them separately.",
      confirmLabel: "Cancel session",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/training-sessions/${sessionId}?church_id=${encodeURIComponent(churchId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.ok) {
        router.push("/dashboard/training-sessions");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to delete (${res.status})`);
      }
    } catch {
      setError("Network error.");
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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="rounded-xl border border-vc-border-light bg-white p-10 text-center">
        <p className="text-vc-text-secondary">{error || "Session not found."}</p>
        <Link
          href="/dashboard/training-sessions"
          className="mt-3 inline-block text-sm text-vc-coral hover:underline"
        >
          ← Back to Training Sessions
        </Link>
      </div>
    );
  }

  const rsvpByVol = new Map<string, TrainingSessionRsvp>(
    (session.rsvps || []).map((r) => [r.volunteer_id, r]),
  );

  // Volunteers list to show in roster: anyone on this ministry's team
  // (or all volunteers for org-wide sessions). Sort: accepted first,
  // declined last, no-response middle, alphabetical inside each group.
  const rosterVols = volunteers
    .filter((v) =>
      session.ministry_id === ORG_WIDE_MINISTRY_ID
        ? true
        : v.ministry_ids.includes(session.ministry_id),
    )
    .sort((a, b) => {
      const ra = rsvpByVol.get(a.id)?.status;
      const rb = rsvpByVol.get(b.id)?.status;
      const order = (s: string | undefined) => (s === "accepted" ? 0 : s === undefined ? 1 : 2);
      const oc = order(ra) - order(rb);
      if (oc !== 0) return oc;
      return a.name.localeCompare(b.name);
    });

  function toggleAttended(id: string) {
    setAttendedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <Link
        href="/dashboard/training-sessions"
        className="text-sm text-vc-text-muted hover:text-vc-coral"
      >
        ← Training Sessions
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-2xl text-vc-indigo">{session.title}</h1>
            <Badge variant={session.status === "completed" ? "success" : session.status === "cancelled" ? "danger" : "default"}>
              {session.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-vc-text-secondary">
            {session.date} · {session.start_time}–{session.end_time} · {session.location}
          </p>
          <p className="mt-0.5 text-xs text-vc-text-muted">
            Fulfills <strong>{prereqLabel}</strong> for{" "}
            <strong>{ministry?.name || "Organization"}</strong>
            {session.capacity > 0 ? ` · Capacity ${session.capacity}` : ""}
            {!session.auto_complete && " · Auto-complete OFF"}
          </p>
        </div>
        {session.status === "scheduled" && (
          <div className="flex gap-2">
            <Button onClick={handleInvite} loading={inviting} variant="outline">
              Send Invitations
            </Button>
            <Button onClick={() => setShowCompleteUI(true)}>
              Mark Complete
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-vc-danger/20 bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
          {error}
        </div>
      )}
      {actionMessage && (
        <div className="mb-4 rounded-lg border border-vc-sage/30 bg-vc-sage/5 px-4 py-3 text-sm text-vc-sage-dark">
          {actionMessage}
        </div>
      )}

      <div className="rounded-xl border border-vc-border-light bg-white overflow-hidden">
        <div className="border-b border-vc-border-light bg-vc-bg-warm/40 px-4 py-2.5 flex items-center justify-between">
          <p className="text-sm font-semibold text-vc-indigo">
            {showCompleteUI ? "Mark attendance" : "Roster"}
          </p>
          <p className="text-xs text-vc-text-muted">
            {rosterVols.length} eligible volunteer{rosterVols.length !== 1 ? "s" : ""}
          </p>
        </div>
        {rosterVols.length === 0 ? (
          <p className="px-4 py-6 text-sm text-vc-text-muted text-center">
            No volunteers are on this team yet.
          </p>
        ) : (
          <ul className="divide-y divide-vc-border-light">
            {rosterVols.map((v) => {
              const r = rsvpByVol.get(v.id);
              const checked = attendedIds.has(v.id);
              return (
                <li key={v.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {showCompleteUI && (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAttended(v.id)}
                        className="h-4 w-4 rounded border-vc-border text-vc-coral focus:ring-vc-coral/30"
                      />
                    )}
                    <span className="text-sm text-vc-indigo truncate">{v.name}</span>
                  </div>
                  {!showCompleteUI && (
                    <span className="shrink-0 text-xs">
                      {r?.status === "accepted" ? (
                        <Badge variant="success">Accepted</Badge>
                      ) : r?.status === "declined" ? (
                        <Badge variant="danger">Declined</Badge>
                      ) : (
                        <span className="text-vc-text-muted">No response</span>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {showCompleteUI && (
          <div className="flex justify-end gap-2 border-t border-vc-border-light px-4 py-3">
            <Button variant="ghost" onClick={() => setShowCompleteUI(false)}>
              Cancel
            </Button>
            <Button onClick={handleMarkComplete} loading={completing}>
              Mark {attendedIds.size} attended
            </Button>
          </div>
        )}
      </div>

      {session.status === "scheduled" && (
        <div className="mt-6 rounded-xl border border-vc-danger/20 bg-vc-danger/5 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-vc-danger mb-1.5">
            Danger zone
          </p>
          <Button onClick={handleCancel} variant="outline" size="sm">
            Cancel session
          </Button>
        </div>
      )}
    </div>
  );
}
