"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getAuth } from "firebase/auth";
import Link from "next/link";

type CheckInState = "loading" | "ready" | "checking_in" | "success" | "error" | "not_logged_in";

export default function CheckInPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const { user, loading: authLoading } = useAuth();

  const [state, setState] = useState<CheckInState>("loading");
  const [message, setMessage] = useState("");
  const [volunteerName, setVolunteerName] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setState("not_logged_in");
      return;
    }
    setState("ready");
  }, [user, authLoading]);

  // Auto-redirect to My Schedule after successful check-in
  useEffect(() => {
    if (state !== "success") return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/dashboard/my-schedule");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state, router]);

  async function handleCheckIn() {
    setState("checking_in");
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setState("error");
        setMessage("Not authenticated. Please sign in and try again.");
        return;
      }

      const res = await fetch("/api/check-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState("error");
        setMessage(data.error || "Check-in failed.");
        return;
      }

      setState("success");
      setVolunteerName(data.volunteer_name || "");
      setServiceDate(data.service_date || "");
    } catch {
      setState("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-vc-bg">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-vc-bg px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-vc-indigo">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
          </div>
          <h1 className="font-display text-2xl text-vc-indigo">Check In</h1>
          <p className="mt-1 text-sm text-vc-text-secondary">
            Code: <span className="font-mono font-semibold tracking-widest text-vc-indigo">{code}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-vc-border-light bg-white p-6 shadow-sm">
          {state === "not_logged_in" && (
            <div className="text-center">
              <p className="mb-4 text-vc-text-secondary">
                Please sign in to check in for this service.
              </p>
              <Link
                href={`/login?redirect=${encodeURIComponent(`/check-in/${code}`)}`}
                className="inline-flex items-center gap-2 rounded-xl bg-vc-coral px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-vc-coral-dark"
              >
                Sign In
              </Link>
            </div>
          )}

          {state === "ready" && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-vc-sage/15">
                <svg className="h-8 w-8 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
              </div>
              <p className="mb-4 text-vc-text-secondary">
                Tap below to check in for today&apos;s service.
              </p>
              <Button onClick={handleCheckIn} className="w-full">
                Check In Now
              </Button>
            </div>
          )}

          {state === "checking_in" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Spinner />
              <p className="text-sm text-vc-text-secondary">Checking you in...</p>
            </div>
          )}

          {state === "success" && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-vc-sage/15">
                <svg className="h-8 w-8 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="font-display text-xl text-vc-indigo mb-1">
                You&apos;re checked in!
              </h2>
              {volunteerName && (
                <p className="text-vc-text-secondary">
                  Welcome, <span className="font-medium text-vc-indigo">{volunteerName}</span>
                </p>
              )}
              {serviceDate && (
                <p className="mt-1 text-sm text-vc-text-muted">
                  {new Date(serviceDate + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
              <Link
                href="/dashboard/my-schedule"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
              >
                View My Schedule
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
              <p className="mt-2 text-xs text-vc-text-muted">
                Redirecting in {countdown}s...
              </p>
            </div>
          )}

          {state === "error" && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-vc-sand/20">
                <svg className="h-8 w-8 text-vc-sand" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <p className="mb-4 text-vc-text-secondary">{message}</p>
              <Button variant="outline" onClick={() => setState("ready")}>
                Try Again
              </Button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-vc-text-muted">
          Powered by <span className="font-semibold text-vc-indigo">Volunteer<span className="text-vc-coral">Cal</span></span>
        </p>
      </div>
    </div>
  );
}
