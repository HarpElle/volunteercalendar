"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { createMembership, membershipDocId, getMembership } from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export default function JoinChurchPage() {
  const params = useParams();
  const router = useRouter();
  const churchId = params.churchId as string;
  const { user, profile, loading: authLoading, refreshMemberships } = useAuth();

  const [churchName, setChurchName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "already_member" | "pending" | "success" | "not_found">("idle");
  const [error, setError] = useState("");

  // Load church info and check existing membership
  useEffect(() => {
    async function load() {
      try {
        const churchSnap = await getDoc(doc(db, "churches", churchId));
        if (!churchSnap.exists()) {
          setStatus("not_found");
          setLoading(false);
          return;
        }
        setChurchName(churchSnap.data().name || "this organization");

        if (user) {
          const existingId = membershipDocId(user.uid, churchId);
          const existing = await getMembership(existingId);
          if (existing) {
            if (existing.status === "active") {
              setStatus("already_member");
            } else if (existing.status === "pending_org_approval") {
              setStatus("pending");
            } else if (existing.status === "pending_volunteer_approval") {
              // They were invited — redirect to accept
              router.replace(`/invites/${existingId}`);
              return;
            }
          }
        }
      } catch {
        setError("Failed to load organization info.");
      }
      setLoading(false);
    }
    if (!authLoading) load();
  }, [churchId, user, authLoading, router]);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      // Redirect to register with return URL
      router.push(`/register?redirect=/join/${churchId}`);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const now = new Date().toISOString();
      await createMembership({
        user_id: user.uid,
        church_id: churchId,
        role: "volunteer",
        ministry_scope: [],
        status: "pending_org_approval",
        invited_by: null,
        volunteer_id: null,
        reminder_preferences: { channels: ["email"] },
        created_at: now,
        updated_at: now,
      });
      await refreshMemberships();
      setStatus("success");
      // Fire-and-forget welcome-to-org email
      getAuth().currentUser?.getIdToken().then((token) =>
        fetch("/api/notify/welcome-to-org", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ church_id: churchId, role: "Volunteer" }),
        }).catch(() => {}),
      );
    } catch (err) {
      setError((err as Error).message || "Failed to submit request.");
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
                Organization Not Found
              </h1>
              <p className="text-center text-vc-text-secondary">
                This link doesn't match any organization on VolunteerCal. Check with your admin for the correct invite link.
              </p>
            </>
          )}

          {status === "already_member" && (
            <>
              <h1 className="font-display text-2xl text-vc-indigo text-center mb-3">
                Already a Member
              </h1>
              <p className="text-center text-vc-text-secondary mb-6">
                You're already a member of <strong className="text-vc-indigo">{churchName}</strong>.
              </p>
              <Button onClick={() => router.push("/dashboard")} className="w-full" size="lg">
                Go to Dashboard
              </Button>
            </>
          )}

          {status === "pending" && (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-vc-sand/30">
                <svg className="h-7 w-7 text-vc-sand" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <h1 className="font-display text-2xl text-vc-indigo text-center mb-3">
                Request Pending
              </h1>
              <p className="text-center text-vc-text-secondary">
                Your request to join <strong className="text-vc-indigo">{churchName}</strong> is waiting for admin approval. You'll get an email when you're approved.
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-vc-sage/20">
                <svg className="h-7 w-7 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h1 className="font-display text-2xl text-vc-indigo text-center mb-3">
                Request Sent!
              </h1>
              <p className="text-center text-vc-text-secondary">
                Your request to join <strong className="text-vc-indigo">{churchName}</strong> has been sent to the admin team. You'll receive an email once you're approved.
              </p>
            </>
          )}

          {status === "idle" && (
            <>
              <h1 className="font-display text-2xl text-vc-indigo text-center mb-2">
                Join {churchName}
              </h1>
              <p className="text-center text-vc-text-secondary mb-6">
                {user
                  ? "Request to join this organization as a volunteer."
                  : "Create an account or sign in to join this organization."}
              </p>

              {error && (
                <div className="mb-4 rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
                  {error}
                </div>
              )}

              <form onSubmit={handleJoin}>
                {user && (
                  <div className="mb-6 rounded-xl border border-vc-border-light bg-vc-bg-warm p-4">
                    <p className="text-sm text-vc-text-muted mb-1">Joining as</p>
                    <p className="font-medium text-vc-indigo">{profile?.display_name || user.email}</p>
                    <p className="text-sm text-vc-text-secondary">{user.email}</p>
                  </div>
                )}

                <Button type="submit" loading={submitting} size="lg" className="w-full">
                  {user ? "Request to Join" : "Sign Up to Join"}
                </Button>

                {!user && (
                  <p className="mt-4 text-center text-sm text-vc-text-muted">
                    Already have an account?{" "}
                    <Link href={`/login?redirect=/join/${churchId}`} className="text-vc-coral hover:underline">
                      Sign in
                    </Link>
                  </p>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
