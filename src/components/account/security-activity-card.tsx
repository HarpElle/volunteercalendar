"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

/**
 * Shows the signed-in user's recent auth.* audit_logs entries (Wave 4.2 hotfix).
 *
 * MFA audit rows are written with `church_id: null` because they're user-scoped,
 * not org-scoped — so they don't appear in /dashboard/settings/activity (which
 * is hard-filtered by church). This card is the user-visible surface for those
 * rows. Backed by GET /api/account/activity.
 *
 * Intentionally narrow: only auth.* actions. If we ever add other user-scoped
 * audit actions outside the auth namespace we'll widen the filter or add a
 * second card.
 */
export function SecurityActivityCard({ user }: { user: User }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/account/activity?limit=20", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error("Failed to load security activity");
        }
        const data = (await res.json()) as { entries: AuditEntry[] };
        if (!cancelled) setEntries(data.entries);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="rounded-2xl border border-vc-border-light bg-white p-6">
      <h3 className="font-display text-lg font-semibold text-vc-indigo">
        Security activity
      </h3>
      <p className="mt-1 text-sm text-vc-text-secondary">
        Your last 20 sign-in security events. Sign out and back in here to
        watch this populate.
      </p>

      {error && (
        <p className="mt-4 text-sm text-vc-coral-dark">{error}</p>
      )}

      {entries === null && !error && (
        <p className="mt-4 text-sm text-vc-text-muted">Loading…</p>
      )}

      {entries !== null && entries.length === 0 && (
        <p className="mt-4 text-sm text-vc-text-muted">
          No security events yet. Enable MFA to start a paper trail.
        </p>
      )}

      {entries !== null && entries.length > 0 && (
        <ol className="mt-4 divide-y divide-vc-border-light overflow-hidden rounded-xl border border-vc-border-light">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-vc-indigo">
                  {labelForAction(entry.action)}
                </p>
                {detailForAction(entry) && (
                  <p className="text-xs text-vc-text-muted">
                    {detailForAction(entry)}
                  </p>
                )}
              </div>
              <p className="text-xs text-vc-text-muted">
                {formatDateTime(entry.created_at)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

interface AuditEntry {
  id: string;
  action: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

function labelForAction(action: string): string {
  switch (action) {
    case "auth.mfa_enrolled":
      return "Two-factor authentication enabled";
    case "auth.mfa_disabled":
      return "Two-factor authentication disabled";
    case "auth.mfa_recovery_codes_regenerated":
      return "Recovery codes regenerated";
    case "auth.mfa_recovery_code_used":
      return "Recovery code used";
    default:
      return action;
  }
}

function detailForAction(entry: AuditEntry): string | null {
  const meta = entry.metadata ?? {};
  if (entry.action === "auth.mfa_disabled" && typeof meta.path === "string") {
    if (meta.path === "user_disabled") return "Disabled from your account settings";
    if (meta.path === "recovery_code_used") return "Disabled because a recovery code was used";
  }
  if (entry.action === "auth.mfa_enrolled" && typeof meta.code_count === "number") {
    return `${meta.code_count} recovery codes generated`;
  }
  return null;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
