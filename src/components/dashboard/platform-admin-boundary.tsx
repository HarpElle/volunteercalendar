"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";

/**
 * Pass G Phase 6 hotfix: route-level platform-admin gate for
 * `/dashboard/platform/*` subtree.
 *
 * Server-side checks at /api/platform/* already use `isPlatformAdmin()`
 * (env-var-backed UID whitelist). But the UI pages themselves were
 * reachable by URL — Codex Phase 6 sweep found Alex (volunteer) could
 * load /dashboard/platform/tier-override and see the form (even though
 * the API call would fail). Now blocked at the layout level.
 *
 * Uses the same /api/platform/me endpoint the dashboard layout already
 * calls. Fail-closed: defaults to forbidden while loading.
 */
export function PlatformAdminBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setIsPlatformAdmin(false);
      return;
    }
    let cancelled = false;
    user
      .getIdToken()
      .then((token) =>
        fetch("/api/platform/me", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setIsPlatformAdmin(data?.is_platform_admin === true);
      })
      .catch(() => {
        if (!cancelled) setIsPlatformAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (isPlatformAdmin === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-vc-warning/10">
          <svg
            className="h-8 w-8 text-vc-warning"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        </div>
        <h1 className="mb-2 font-display text-3xl text-vc-indigo">
          Platform Admin Only
        </h1>
        <p className="mb-6 text-sm text-vc-text-secondary">
          This area is restricted to VolunteerCal platform administrators.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-vc-coral px-6 text-sm font-semibold text-white transition-colors hover:bg-vc-coral/90"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
