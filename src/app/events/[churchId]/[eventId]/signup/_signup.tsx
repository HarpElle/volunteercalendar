"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  TurnstileWidget,
  isTurnstileEnabled,
} from "@/components/forms/turnstile-widget";
import type { Event, RoleSlot, EventSignup, Church } from "@/lib/types";

type PageState = "loading" | "not_found" | "ready" | "submitted";

export default function EventSignupPage() {
  const { churchId, eventId } = useParams<{ churchId: string; eventId: string }>();
  const { user, profile } = useAuth();

  const [state, setState] = useState<PageState>("loading");
  const [event, setEvent] = useState<Event | null>(null);
  const [church, setChurch] = useState<Church | null>(null);
  // Pass H Phase 4: campus comes from /api/signup as `{ id, name }` so
  // public visitors get the human-readable label without us exposing the
  // full campus doc (only id + name surface).
  const [campus, setCampus] = useState<{ id: string; name: string } | null>(null);
  const [signups, setSignups] = useState<EventSignup[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  // Stable token-setter so the Turnstile widget doesn't re-render on every
  // parent render (which would cycle the challenge).
  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const turnstileRequired = isTurnstileEnabled() && !user;
  // Only require Turnstile for guest (unauthenticated) signups. Logged-in
  // users have a Firebase ID token which is its own bot challenge.

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/signup?eventId=${eventId}&churchId=${churchId}`);
        if (!res.ok) {
          setState("not_found");
          return;
        }
        const data = await res.json();
        setEvent(data.event as Event);
        setChurch(data.church as Church);
        setCampus((data.campus as { id: string; name: string } | null) ?? null);
        setSignups(data.signups as EventSignup[]);
        setState("ready");
      } catch {
        setState("not_found");
      }
    }
    load();
  }, [eventId, churchId]);

  async function handleSignup() {
    if (!event) return;
    if (!selectedRoleId) {
      setErrorMsg("Please select a role.");
      return;
    }

    const isLoggedIn = !!user;
    if (!isLoggedIn && (!guestName.trim() || !guestEmail.trim())) {
      setErrorMsg("Please enter your name and email.");
      return;
    }
    if (turnstileRequired && !turnstileToken) {
      setErrorMsg("Please complete the bot challenge.");
      return;
    }

    setErrorMsg("");
    setSubmitting(true);

    try {
      const body: Record<string, string | null> = {
        event_id: event.id,
        church_id: event.church_id,
        role_id: selectedRoleId,
        volunteer_name: isLoggedIn ? (profile?.display_name || "") : guestName.trim(),
        volunteer_email: isLoggedIn ? (profile?.email || "") : guestEmail.trim(),
        user_id: isLoggedIn ? user!.uid : null,
        // Empty string when Turnstile is env-gated off OR when caller is
        // authenticated. Server skips verification in both cases.
        turnstile_token: turnstileToken,
      };

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (isLoggedIn) {
        const token = await user!.getIdToken();
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/signup", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Signup failed" }));
        setErrorMsg(err.error || "Signup failed. Please try again.");
        return;
      }

      setState("submitted");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function formatTime(t: string | null) {
    if (!t) return "";
    const [h, m] = t.split(":");
    const hour = Number(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${h12}:${m} ${ampm}`;
  }

  function getRoleAvailability(role: RoleSlot) {
    const filled = signups.filter(
      (s) => s.role_id === role.role_id && s.status !== "cancelled",
    ).length;
    return { filled, remaining: Math.max(0, role.count - filled) };
  }

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-vc-bg">
        <Spinner size="lg" />
      </div>
    );
  }

  if (state === "not_found") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-vc-bg px-4">
        <div className="text-center">
          <h1 className="font-display text-2xl text-vc-indigo">Event not found</h1>
          <p className="mt-2 text-vc-text-secondary">
            This event may have been removed or the link is incorrect.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-vc-coral hover:text-vc-coral-dark transition-colors">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  if (state === "submitted") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-vc-bg px-4">
        <div className="w-full max-w-md rounded-2xl border border-vc-border-light bg-white p-8 text-center shadow-xl shadow-black/[0.03]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-vc-sage/15">
            <svg className="h-8 w-8 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h1 className="mt-4 font-display text-2xl text-vc-indigo">You&apos;re signed up!</h1>
          <p className="mt-2 text-vc-text-secondary">
            You&apos;ve been signed up for <strong>{event?.name}</strong>.
            {event?.date && ` See you on ${event.date}.`}
          </p>
          {user ? (
            <Link href="/dashboard/my-schedule">
              <Button className="mt-6">View My Schedule</Button>
            </Link>
          ) : (
            <div className="mt-6 space-y-2">
              <p className="text-sm text-vc-text-muted">
                Create an account to manage your signups and get reminders.
              </p>
              <Link href={`/register?email=${encodeURIComponent(guestEmail)}&name=${encodeURIComponent(guestName)}`}>
                <Button>Create Account</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Ready state
  const signupRoles = event!.roles.filter((r) => r.allow_signup);
  const alreadySignedUp = user
    ? signups.some((s) => s.user_id === user.uid && s.status !== "cancelled")
    : false;

  return (
    <div className="min-h-screen bg-vc-bg">
      {/* Header */}
      <header className="border-b border-vc-border-light bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-vc-indigo">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
          </div>
          <span className="text-lg font-semibold text-vc-indigo">
            Volunteer<span className="text-vc-coral">Cal</span>
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Event info */}
        <div className="rounded-2xl border border-vc-border-light bg-white p-6 shadow-xl shadow-black/[0.03]">
          {church && (
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-vc-text-muted">
              {church.name}
            </p>
          )}
          <h1 className="font-display text-3xl text-vc-indigo">{event!.name}</h1>

          <div className="mt-3 flex flex-wrap gap-3 text-sm text-vc-text-secondary">
            <span className="flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              {event!.date}
            </span>
            {!event!.all_day && event!.start_time && (
              <span className="flex items-center gap-1">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                {formatTime(event!.start_time)}
                {event!.end_time && `–${formatTime(event!.end_time)}`}
              </span>
            )}
            {event!.all_day && (
              <span className="rounded-full bg-vc-sand/30 px-2 py-0.5 text-xs font-medium text-vc-text-secondary">
                All day
              </span>
            )}
            {/* Pass H Phase 4: campus chip on public event pages so
                signers-up at multi-campus orgs know which location they
                are committing to. Hidden when the event has no
                campus_id (org-wide event). Visible to ALL visitors
                including non-logged-in — the campus name is the only
                campus metadata exposed (id + name only from the API). */}
            {campus && (
              <span
                className="flex items-center gap-1 rounded-full bg-vc-indigo/8 px-2.5 py-0.5 text-xs font-medium text-vc-indigo-muted"
                title={`Campus: ${campus.name}`}
              >
                📍 {campus.name}
              </span>
            )}
          </div>

          {event!.description && (
            <p className="mt-4 text-vc-text-secondary leading-relaxed">{event!.description}</p>
          )}
        </div>

        {/* Already signed up */}
        {alreadySignedUp && (
          <div className="mt-4 rounded-xl border border-vc-sage/30 bg-vc-sage/10 p-4 text-center">
            <p className="font-medium text-vc-sage">You&apos;re already signed up for this event!</p>
            <Link
              href="/dashboard/my-schedule"
              className="mt-1 inline-block text-sm text-vc-text-secondary hover:text-vc-coral transition-colors"
            >
              View my schedule
            </Link>
          </div>
        )}

        {/* Role selection */}
        {!alreadySignedUp && signupRoles.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-3 text-lg font-semibold text-vc-indigo">Choose a Role</h2>
            <div className="space-y-2">
              {signupRoles.map((role) => {
                const { remaining } = getRoleAvailability(role);
                const isFull = remaining === 0;
                const isSelected = selectedRoleId === role.role_id;
                const hasCustomTime = role.start_time || role.end_time;

                return (
                  <button
                    key={role.role_id}
                    type="button"
                    disabled={isFull}
                    onClick={() => setSelectedRoleId(role.role_id)}
                    className={`w-full rounded-xl border p-4 text-left transition-all ${
                      isFull
                        ? "border-vc-border-light bg-vc-bg opacity-50 cursor-not-allowed"
                        : isSelected
                          ? "border-vc-coral bg-vc-coral/5 ring-2 ring-vc-coral/20"
                          : "border-vc-border-light bg-white hover:border-vc-coral/40 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-vc-indigo">{role.title}</span>
                        {hasCustomTime && (
                          <span className="ml-2 text-xs text-vc-text-muted">
                            {formatTime(role.start_time)}–{formatTime(role.end_time)}
                          </span>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          isFull
                            ? "bg-vc-danger/10 text-vc-danger"
                            : remaining <= 2
                              ? "bg-vc-sand/40 text-vc-text-secondary"
                              : "bg-vc-sage/15 text-vc-sage"
                        }`}
                      >
                        {isFull ? "Full" : `${remaining} spot${remaining !== 1 ? "s" : ""} left`}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-vc-coral">
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                        </svg>
                        Selected
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Guest info (not logged in) */}
        {!alreadySignedUp && !user && signupRoles.length > 0 && (
          <div className="mt-6 rounded-xl border border-vc-border-light bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-vc-indigo">Your Information</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Name"
                required
                placeholder="Your full name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
              <Input
                label="Email"
                type="email"
                required
                placeholder="you@example.com"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
              />
            </div>
            <p className="mt-2 text-xs text-vc-text-muted">
              Already have an account?{" "}
              <Link
                href={`/login?redirect=/events/${churchId}/${eventId}/signup`}
                className="font-medium text-vc-coral hover:text-vc-coral-dark"
              >
                Sign in
              </Link>
            </p>
          </div>
        )}

        {/* Turnstile bot challenge — guest signups only (logged-in users
            already have Firebase ID token). Renders nothing when
            NEXT_PUBLIC_TURNSTILE_SITE_KEY isn't set (env-gated). */}
        {turnstileRequired && (
          <div className="mt-4">
            <TurnstileWidget onToken={handleTurnstileToken} />
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="mt-4 rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
            {errorMsg}
          </div>
        )}

        {/* Submit */}
        {!alreadySignedUp && signupRoles.length > 0 && (
          <div className="mt-6">
            <Button
              onClick={handleSignup}
              loading={submitting}
              disabled={
                !selectedRoleId || (turnstileRequired && !turnstileToken)
              }
              className="w-full"
              size="lg"
            >
              Sign Up
            </Button>
          </div>
        )}

        {/* No signup roles */}
        {signupRoles.length === 0 && !alreadySignedUp && (
          <div className="mt-6 rounded-xl border border-dashed border-vc-border bg-white p-8 text-center">
            <p className="text-vc-text-secondary">
              No roles are currently open for signup.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
