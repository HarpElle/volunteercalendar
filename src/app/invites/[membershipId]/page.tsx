"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { getMembership, updateMembershipStatus } from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Membership } from "@/lib/types";

export default function AcceptInvitePage() {
  const params = useParams();
  const router = useRouter();
  const membershipId = params.membershipId as string;
  const { user, loading: authLoading, refreshMemberships } = useAuth();

  const [membership, setMembership] = useState<Membership | null>(null);
  const [churchName, setChurchName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "accepted" | "declined" | "not_found" | "wrong_user" | "already_active">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const m = await getMembership(membershipId);
        if (!m) {
          setStatus("not_found");
          setLoading(false);
          return;
        }
        setMembership(m);

        // Load church name
        const churchSnap = await getDoc(doc(db, "churches", m.church_id));
        if (churchSnap.exists()) {
          setChurchName(churchSnap.data().name || "this organization");
        }

        if (m.status === "active") {
          setStatus("already_active");
        } else if (m.status !== "pending_volunteer_approval") {
          setStatus("not_found");
        } else if (user && m.user_id !== user.uid) {
          setStatus("wrong_user");
        }
      } catch {
        setError("Failed to load invitation.");
      }
      setLoading(false);
    }
    if (!authLoading) load();
  }, [membershipId, user, authLoading]);

  async function handleAccept() {
    if (!user || !membership) {
      router.push(`/login?redirect=/invites/${membershipId}`);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await updateMembershipStatus(membershipId, "active");
      await refreshMemberships();
      setStatus("accepted");
    } catch (err) {
      setError((err as Error).message || "Failed to accept invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    if (!membership) return;
    setSubmitting(true);
    setError("");
    try {
      await updateMembershipStatus(membershipId, "inactive");
      setStatus("declined");
    } catch (err) {
      setError((err as Error).message || "Failed to decline invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-vc-bg">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-vc-bg px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link href="/" className="inline-block text-xl font-semibold text-vc-indigo">
            Volunteer<span className="text-vc-coral">Cal</span>
          </Link>
        </div>

        <div className="rounded-2xl border border-vc-border-light bg-white p-8 shadow-sm">
          {status === "not_found" && (
            <>
              <h1 className="font-display text-2xl text-vc-indigo text-center mb-3">
                Invitation Not Found
              </h1>
              <p className="text-center text-vc-text-secondary">
                This invitation link is invalid or has expired. Contact your organization admin for a new invite.
              </p>
            </>
          )}

          {status === "wrong_user" && (
            <>
              <h1 className="font-display text-2xl text-vc-indigo text-center mb-3">
                Wrong Account
              </h1>
              <p className="text-center text-vc-text-secondary">
                This invitation was sent to a different account. Sign in with the email address the invite was sent to.
              </p>
            </>
          )}

          {status === "already_active" && (
            <>
              <h1 className="font-display text-2xl text-vc-indigo text-center mb-3">
                Already a Member
              </h1>
              <p className="text-center text-vc-text-secondary mb-6">
                You're already an active member of <strong className="text-vc-indigo">{churchName}</strong>.
              </p>
              <Button onClick={() => router.push("/dashboard")} className="w-full" size="lg">
                Go to Dashboard
              </Button>
            </>
          )}

          {status === "accepted" && (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-vc-sage/20">
                <svg className="h-7 w-7 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h1 className="font-display text-2xl text-vc-indigo text-center mb-3">
                Welcome!
              </h1>
              <p className="text-center text-vc-text-secondary mb-6">
                You've joined <strong className="text-vc-indigo">{churchName}</strong>. Head to your dashboard to get started.
              </p>
              <Button onClick={() => router.push("/dashboard")} className="w-full" size="lg">
                Go to Dashboard
              </Button>
            </>
          )}

          {status === "declined" && (
            <>
              <h1 className="font-display text-2xl text-vc-indigo text-center mb-3">
                Invitation Declined
              </h1>
              <p className="text-center text-vc-text-secondary">
                You've declined the invitation to join <strong className="text-vc-indigo">{churchName}</strong>. If this was a mistake, contact your organization admin.
              </p>
            </>
          )}

          {status === "idle" && (
            <>
              <h1 className="font-display text-2xl text-vc-indigo text-center mb-2">
                You're Invited
              </h1>
              <p className="text-center text-vc-text-secondary mb-6">
                You've been invited to join <strong className="text-vc-indigo">{churchName}</strong> on VolunteerCal
                {membership ? ` as a ${membership.role}` : ""}.
              </p>

              {error && (
                <div className="mb-4 rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
                  {error}
                </div>
              )}

              {!user ? (
                <>
                  <Button onClick={() => router.push(`/login?redirect=/invites/${membershipId}`)} size="lg" className="w-full mb-3">
                    Sign In to Accept
                  </Button>
                  <p className="text-center text-sm text-vc-text-muted">
                    Don't have an account?{" "}
                    <Link href={`/register?redirect=/invites/${membershipId}`} className="text-vc-coral hover:underline">
                      Sign up
                    </Link>
                  </p>
                </>
              ) : (
                <div className="space-y-3">
                  <Button onClick={handleAccept} loading={submitting} size="lg" className="w-full">
                    Accept Invitation
                  </Button>
                  <button
                    onClick={handleDecline}
                    disabled={submitting}
                    className="w-full rounded-xl border border-vc-border px-4 py-3 text-sm font-medium text-vc-text-secondary hover:bg-vc-bg-warm transition-colors disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
