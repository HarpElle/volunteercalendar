"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface ConfirmationData {
  assignment: {
    id: string;
    status: string;
    service_date: string;
    role_title: string;
    responded_at: string | null;
  };
  volunteer_name: string;
  service_name: string;
  ministry_name: string;
  church_name: string;
}

type PageState = "loading" | "ready" | "responded" | "already_responded" | "error";

export default function ConfirmPage() {
  const params = useParams();
  const token = params.token as string;

  const [state, setState] = useState<PageState>("loading");
  const [data, setData] = useState<ConfirmationData | null>(null);
  const [responseStatus, setResponseStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/confirm?token=${encodeURIComponent(token)}`);
        if (!res.ok) {
          const err = await res.json();
          setError(err.error || "Assignment not found");
          setState("error");
          return;
        }
        const json = await res.json();
        setData(json);

        if (json.assignment.responded_at) {
          setResponseStatus(json.assignment.status);
          setState("already_responded");
        } else {
          setState("ready");
        }
      } catch {
        setError("Unable to load assignment details");
        setState("error");
      }
    }
    load();
  }, [token]);

  async function handleAction(action: "confirm" | "decline") {
    setSubmitting(true);
    try {
      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action }),
      });
      const json = await res.json();

      if (res.status === 409) {
        setResponseStatus(json.status);
        setState("already_responded");
        return;
      }

      if (!res.ok) {
        setError(json.error || "Something went wrong");
        return;
      }

      setResponseStatus(json.status);
      setState("responded");
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-vc-bg px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-vc-indigo">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
            </div>
            <span className="font-display text-xl font-bold text-vc-indigo">VolunteerCalendar</span>
          </Link>
        </div>

        {/* Loading */}
        {state === "loading" && (
          <div className="rounded-2xl border border-vc-border-light bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-vc-indigo/20 border-t-vc-indigo" />
            <p className="text-vc-text-secondary">Loading your assignment...</p>
          </div>
        )}

        {/* Error */}
        {state === "error" && (
          <div className="rounded-2xl border border-vc-danger/20 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-vc-danger/10">
              <svg className="h-7 w-7 text-vc-danger" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <h2 className="mb-2 font-display text-xl font-bold text-vc-indigo">Link Not Found</h2>
            <p className="text-sm text-vc-text-secondary">
              {error || "This confirmation link may have expired or is invalid."}
            </p>
            <p className="mt-4 text-xs text-vc-text-muted">
              If you believe this is an error, contact your church administrator.
            </p>
          </div>
        )}

        {/* Ready to respond */}
        {state === "ready" && data && (
          <div className="rounded-2xl border border-vc-border-light bg-white shadow-sm overflow-hidden">
            <div className="bg-vc-indigo px-6 py-5 text-center">
              <h2 className="font-display text-xl font-bold text-white">
                You&apos;re Scheduled!
              </h2>
              <p className="mt-1 text-sm text-white/70">
                {data.church_name}
              </p>
            </div>

            <div className="px-6 py-6">
              <p className="mb-5 text-sm text-vc-text-secondary">
                Hi <span className="font-semibold text-vc-indigo">{data.volunteer_name}</span>,
                you&apos;ve been scheduled to serve. Please confirm or decline below.
              </p>

              <div className="mb-6 space-y-3 rounded-xl bg-vc-bg-warm p-4">
                <div className="flex items-start gap-3">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-vc-text-muted">Date</p>
                    <p className="font-semibold text-vc-indigo">{formatDate(data.assignment.service_date)}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                  </svg>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-vc-text-muted">Ministry</p>
                    <p className="font-semibold text-vc-indigo">{data.ministry_name}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-vc-text-muted">Role</p>
                    <p className="font-semibold text-vc-indigo">{data.assignment.role_title}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                  </svg>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-vc-text-muted">Service</p>
                    <p className="font-semibold text-vc-indigo">{data.service_name}</p>
                  </div>
                </div>
              </div>

              {error && (
                <p className="mb-4 rounded-lg bg-vc-danger/10 px-3 py-2 text-sm text-vc-danger">
                  {error}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => handleAction("decline")}
                  disabled={submitting}
                  className="flex-1 rounded-xl border border-vc-border bg-white px-4 py-3 text-sm font-semibold text-vc-text-secondary transition-colors hover:border-vc-danger/30 hover:bg-vc-danger/5 hover:text-vc-danger disabled:opacity-50"
                >
                  {submitting ? "Sending..." : "Decline"}
                </button>
                <button
                  onClick={() => handleAction("confirm")}
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-vc-sage px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-vc-sage/90 disabled:opacity-50"
                >
                  {submitting ? "Sending..." : "I\u2019ll Be There!"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Successfully responded */}
        {state === "responded" && (
          <div className="rounded-2xl border border-vc-border-light bg-white p-8 text-center shadow-sm">
            {responseStatus === "confirmed" ? (
              <>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-vc-sage/10">
                  <svg className="h-8 w-8 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <h2 className="mb-2 font-display text-xl font-bold text-vc-indigo">
                  You&apos;re Confirmed!
                </h2>
                <p className="text-sm text-vc-text-secondary">
                  Thank you for confirming. Your team is counting on you!
                </p>
                {data && (
                  <p className="mt-3 text-xs text-vc-text-muted">
                    {data.service_name} &middot; {formatDate(data.assignment.service_date)}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-vc-sand/20">
                  <svg className="h-8 w-8 text-vc-sand-dark" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 16.318A4.486 4.486 0 0 0 12.016 15a4.486 4.486 0 0 0-3.198 1.318M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
                  </svg>
                </div>
                <h2 className="mb-2 font-display text-xl font-bold text-vc-indigo">
                  Response Recorded
                </h2>
                <p className="text-sm text-vc-text-secondary">
                  We understand! Your team leader has been notified and will find a substitute.
                </p>
              </>
            )}
          </div>
        )}

        {/* Already responded */}
        {state === "already_responded" && (
          <div className="rounded-2xl border border-vc-border-light bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-vc-bg-warm">
              <svg className="h-7 w-7 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
            </div>
            <h2 className="mb-2 font-display text-xl font-bold text-vc-indigo">
              Already Responded
            </h2>
            <p className="text-sm text-vc-text-secondary">
              You&apos;ve already responded to this assignment
              {responseStatus && (
                <span>
                  {" — "}
                  <span className={responseStatus === "confirmed" ? "font-semibold text-vc-sage" : "font-semibold text-vc-text-muted"}>
                    {responseStatus === "confirmed" ? "Confirmed" : "Declined"}
                  </span>
                </span>
              )}.
            </p>
            <p className="mt-4 text-xs text-vc-text-muted">
              Need to change your response? Contact your church administrator.
            </p>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-vc-text-muted">
          Powered by <Link href="/" className="text-vc-coral hover:underline">VolunteerCalendar</Link>
        </p>
      </div>
    </div>
  );
}
