"use client";

import { useState, useCallback, type FormEvent } from "react";
import Link from "next/link";
import {
  TurnstileWidget,
  isTurnstileEnabled,
} from "@/components/forms/turnstile-widget";

/**
 * /abuse — public abuse-reporting form.
 *
 * Pass G Phase 5. Single page: textarea + optional reply email + Turnstile.
 * Submit posts to /api/abuse-report which emails info@volunteercal.com.
 *
 * Plan §1 decision #7: keep this simple, no queue/admin UI. Build one
 * after first 50 orgs justify it.
 */
export default function AbusePage() {
  const [report, setReport] = useState("");
  const [email, setEmail] = useState("");
  const [context, setContext] = useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleToken = useCallback((t: string) => setToken(t), []);
  const turnstileActive = isTurnstileEnabled();
  const submitDisabled =
    submitting ||
    report.trim().length < 20 ||
    (turnstileActive && !token);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/abuse-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: report.trim(),
          reporter_email: email.trim() || null,
          context: context.trim() || null,
          turnstile_token: token,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send report");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-vc-bg px-6 py-16">
      <div className="mx-auto max-w-xl">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-vc-text-muted hover:text-vc-indigo"
          >
            ← VolunteerCal
          </Link>
          <h1 className="mt-3 font-display text-3xl text-vc-indigo">
            Report Abuse
          </h1>
          <p className="mt-2 text-sm text-vc-text-secondary">
            Tell us about suspected misuse of VolunteerCal — phishing,
            scam organizations, harassment, or anything that doesn&apos;t
            belong on the platform. We read every report.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-2xl border border-vc-sage/30 bg-vc-sage/5 p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-vc-sage/10">
              <svg
                className="h-6 w-6 text-vc-sage"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m4.5 12.75 6 6 9-13.5"
                />
              </svg>
            </div>
            <h2 className="font-display text-xl text-vc-indigo">
              Report received
            </h2>
            <p className="mt-2 text-sm text-vc-text-secondary">
              Thanks — we&apos;ll review and act on it. If you provided an
              email, we may reach out for follow-up details.
            </p>
            <Link
              href="/"
              className="mt-6 inline-block text-sm font-medium text-vc-coral hover:text-vc-coral-dark"
            >
              Back to VolunteerCal
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-2xl border border-vc-border-light bg-white p-8 shadow-sm"
          >
            <div>
              <label
                htmlFor="report"
                className="mb-1.5 block text-sm font-medium text-vc-indigo"
              >
                What&apos;s happening?
                <span className="ml-1 text-vc-text-muted">(required)</span>
              </label>
              <textarea
                id="report"
                value={report}
                onChange={(e) => setReport(e.target.value)}
                required
                minLength={20}
                maxLength={4000}
                rows={8}
                placeholder="Be as specific as you can. Include org names, URLs, or screenshots-by-description if relevant."
                className="w-full rounded-xl border border-vc-border bg-white px-4 py-3 text-base text-vc-indigo placeholder:text-vc-text-muted/60 focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
              />
              <p className="mt-1 text-xs text-vc-text-muted">
                {report.length} / 4000 characters · minimum 20
              </p>
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-vc-indigo"
              >
                Your email{" "}
                <span className="text-vc-text-muted">(optional)</span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-vc-border bg-white px-4 py-3 text-base text-vc-indigo placeholder:text-vc-text-muted/60 focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
              />
              <p className="mt-1 text-xs text-vc-text-muted">
                We&apos;ll only use this to follow up on your report.
              </p>
            </div>

            <div>
              <label
                htmlFor="context"
                className="mb-1.5 block text-sm font-medium text-vc-indigo"
              >
                How did you encounter this?{" "}
                <span className="text-vc-text-muted">(optional)</span>
              </label>
              <input
                id="context"
                type="text"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                maxLength={500}
                placeholder="e.g. received an email, visited a join link, saw it on social media…"
                className="w-full rounded-xl border border-vc-border bg-white px-4 py-3 text-base text-vc-indigo placeholder:text-vc-text-muted/60 focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
              />
            </div>

            <TurnstileWidget onToken={handleToken} />

            {error && (
              <div className="rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitDisabled}
              className="w-full rounded-full bg-vc-coral px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-vc-coral/20 transition-all hover:bg-vc-coral-dark hover:shadow-xl disabled:opacity-60 disabled:pointer-events-none"
            >
              {submitting ? "Sending..." : "Send Report"}
            </button>

            <p className="text-center text-xs text-vc-text-muted">
              Prefer email? Write to{" "}
              <a
                href="mailto:info@volunteercal.com"
                className="font-medium text-vc-coral hover:underline"
              >
                info@volunteercal.com
              </a>
              .
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
