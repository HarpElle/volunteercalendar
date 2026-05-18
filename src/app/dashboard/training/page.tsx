"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { where } from "firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TrainingSession, Person, TrainingSessionRsvp } from "@/lib/types";

type RsvpStatus = "accepted" | "declined";

/**
 * /dashboard/training?session=X&church=Y — volunteer RSVP page.
 *
 * Linked from the training-session invitation email (see
 * src/lib/utils/emails/training-session-invite.ts). Shows session info,
 * the volunteer's current RSVP if any, and Accept / Decline buttons.
 *
 * The route is volunteer-facing, gated by the dashboard layout's auth
 * check. Anyone in the church can land here via the email link — the
 * RSVP API does the volunteer-id resolution + permission check.
 *
 * PR #38 (Phase 6 follow-up #4).
 */
export default function VolunteerRsvpPage() {
  const params = useSearchParams();
  const sessionId = params.get("session");
  const churchId = params.get("church");
  const { user, memberships } = useAuth();

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [myPersonId, setMyPersonId] = useState<string | null>(null);
  const [myRsvp, setMyRsvp] = useState<TrainingSessionRsvp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<RsvpStatus | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !churchId || !user) return;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Verify the user is a member of this church.
        const member = memberships.find(
          (m) => m.church_id === churchId && m.status === "active",
        );
        if (!member) {
          setError("You don't have access to this training session.");
          setLoading(false);
          return;
        }

        const token = await user!.getIdToken();
        const sessRes = await fetch(
          `/api/training-sessions/${sessionId}?church_id=${encodeURIComponent(churchId!)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!sessRes.ok) {
          const data = await sessRes.json().catch(() => ({}));
          setError(data.error || `Couldn't load session (${sessRes.status})`);
          setLoading(false);
          return;
        }
        const data = await sessRes.json();
        const sess = data.session as TrainingSession;
        setSession(sess);

        // Resolve my person_id.
        let personId: string | null = member.volunteer_id;
        if (!personId) {
          const peopleDocs = (await getChurchDocuments(
            churchId!,
            "people",
            where("user_id", "==", user!.uid),
          )) as unknown[];
          const me = (peopleDocs as Person[])[0];
          personId = me?.id || null;
        }
        if (!personId) {
          setError(
            "We couldn't find your volunteer record. Ask your church admin to add you to the team and try again.",
          );
          setLoading(false);
          return;
        }
        setMyPersonId(personId);
        const existing = (sess.rsvps || []).find((r) => r.volunteer_id === personId);
        if (existing) setMyRsvp(existing);
      } catch {
        setError("Failed to load session. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId, churchId, user, memberships]);

  async function submit(status: RsvpStatus) {
    if (!session || !user || !churchId || !myPersonId) return;
    setSubmitting(status);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/training-sessions/${session.id}/rsvp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            church_id: churchId,
            volunteer_id: myPersonId,
            status,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Couldn't record your RSVP (${res.status})`);
        return;
      }
      setMyRsvp(data.rsvp as TrainingSessionRsvp);
      setDoneMessage(
        status === "accepted"
          ? "You're in! We'll see you there."
          : "Got it — we'll mark you as declined.",
      );
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(null);
    }
  }

  if (!sessionId || !churchId) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-vc-border-light bg-white p-10 text-center">
        <p className="text-vc-text-secondary">
          This RSVP link is missing some details. Open the link from your
          invitation email again, or ask your church admin to resend it.
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

  if (error && !session) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-vc-danger/20 bg-vc-danger/5 px-4 py-3 text-center">
        <p className="text-sm text-vc-danger">{error}</p>
      </div>
    );
  }

  if (!session) return null;

  const accepted = (session.rsvps || []).filter((r) => r.status === "accepted").length;
  const spotsRemaining =
    session.capacity > 0 ? Math.max(0, session.capacity - accepted) : null;
  const sessionLocked =
    session.status !== "scheduled" ||
    (spotsRemaining === 0 && myRsvp?.status !== "accepted");

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-vc-indigo">Training Session</h1>
        <p className="mt-1 text-sm text-vc-text-secondary">
          Let your church know whether you can make it.
        </p>
      </div>

      <div className="rounded-xl border border-vc-border-light bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-vc-indigo">{session.title}</p>
            <p className="mt-0.5 text-sm text-vc-text-secondary">
              {session.date} · {session.start_time}–{session.end_time}
            </p>
            <p className="mt-0.5 text-sm text-vc-text-secondary">{session.location}</p>
          </div>
          {session.status !== "scheduled" && (
            <Badge variant={session.status === "completed" ? "success" : "danger"}>
              {session.status}
            </Badge>
          )}
        </div>
        {spotsRemaining !== null && (
          <p className="mt-3 text-xs text-vc-text-muted">
            {spotsRemaining} spot{spotsRemaining !== 1 ? "s" : ""} remaining
          </p>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-vc-danger/20 bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
          {error}
        </div>
      )}
      {doneMessage && (
        <div className="mt-4 rounded-lg border border-vc-sage/30 bg-vc-sage/5 px-4 py-3 text-sm text-vc-sage-dark">
          {doneMessage}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-vc-text-secondary">
          Current RSVP:{" "}
          {myRsvp ? (
            <strong className="text-vc-indigo">
              {myRsvp.status === "accepted" ? "Going" : "Declined"}
            </strong>
          ) : (
            <em className="text-vc-text-muted">no response yet</em>
          )}
        </div>
        {!sessionLocked && (
          <div className="flex gap-2">
            <Button
              onClick={() => submit("declined")}
              loading={submitting === "declined"}
              variant="outline"
              size="md"
              disabled={submitting !== null}
            >
              Can&apos;t make it
            </Button>
            <Button
              onClick={() => submit("accepted")}
              loading={submitting === "accepted"}
              size="md"
              disabled={submitting !== null}
            >
              {myRsvp?.status === "accepted" ? "Already going" : "I'm going"}
            </Button>
          </div>
        )}
      </div>

      {sessionLocked && session.status === "scheduled" && spotsRemaining === 0 && (
        <p className="mt-3 text-xs text-vc-coral">
          This session is full. Ask your admin if another date is being added.
        </p>
      )}

      <div className="mt-8 text-center">
        <Link
          href="/dashboard/my-schedule"
          className="text-sm text-vc-coral hover:underline"
        >
          ← Back to My Schedule
        </Link>
      </div>
    </div>
  );
}
