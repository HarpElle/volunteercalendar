"use client";

/**
 * /dashboard/org/activity — Owner-visible activity feed (Track F.3).
 *
 * Reads from /api/admin/audit-logs. Filterable by action category, time
 * window. Designed for "I want to see what's happened" customer support
 * use cases and for end-of-week review.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { AccessDenied } from "@/components/ui/access-denied";
import { isAdmin } from "@/lib/utils/permissions";

interface AuditEntry {
  id: string;
  church_id: string | null;
  actor: string;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  metadata?: Record<string, unknown>;
  outcome: "ok" | "denied" | "failed";
  created_at: string;
}

const ACTION_CATEGORIES: Array<{ label: string; prefix: string }> = [
  { label: "All activity", prefix: "" },
  { label: "Schedule", prefix: "schedule." },
  { label: "Memberships", prefix: "membership." },
  { label: "Billing", prefix: "billing." },
  { label: "Children's check-in", prefix: "kiosk." },
  { label: "Organization", prefix: "org." },
  { label: "Short links", prefix: "short_link." },
];

const ACTION_LABELS: Record<string, string> = {
  "schedule.publish": "Schedule published",
  "schedule.unpublish": "Schedule unpublished",
  "schedule.delete": "Schedule deleted",
  "membership.invite": "Member invited",
  "membership.approve": "Member approved",
  "membership.role_change": "Role changed",
  "membership.remove": "Member removed",
  "membership.deactivate": "Member deactivated",
  "billing.subscription_created": "Subscription started",
  "billing.subscription_updated": "Subscription updated",
  "billing.subscription_canceled": "Subscription canceled",
  "billing.invoice_paid": "Invoice paid",
  "billing.invoice_failed": "Payment failed",
  "billing.dispute_created": "Charge dispute filed",
  "kiosk.station_create": "Kiosk station enrolled",
  "kiosk.station_revoke": "Kiosk station revoked",
  "kiosk.station_reissue_code": "Kiosk activation code reissued",
  "kiosk.activate": "Kiosk activated",
  "kiosk.lookup": "Kiosk family lookup",
  "kiosk.checkin": "Children checked in",
  "kiosk.checkout": "Children checked out",
  "kiosk.register_visitor": "Walk-up family registered",
  "kiosk.medical_data_revealed": "Medical info revealed at kiosk",
  "org.create": "Organization created",
  "org.delete": "Organization deleted",
  "org.tier_change": "Plan changed",
  "short_link.create_external": "External short link created",
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatActor(actor: string): string {
  if (actor === "system") return "System";
  if (actor.startsWith("user:")) return "Admin";
  if (actor.startsWith("kiosk:")) return "Kiosk";
  if (actor.startsWith("platform_admin:")) return "Platform admin";
  return actor;
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function summary(entry: AuditEntry): string {
  const meta = entry.metadata ?? {};
  switch (entry.action) {
    case "kiosk.checkin":
      return `${(meta as { children_count?: number }).children_count ?? 0} child${
        ((meta as { children_count?: number }).children_count ?? 0) === 1 ? "" : "ren"
      }${(meta as { had_alerts?: boolean }).had_alerts ? " (with alerts)" : ""}`;
    case "kiosk.medical_data_revealed":
      return `${(meta as { count?: number }).count ?? 0} child record${
        ((meta as { count?: number }).count ?? 0) === 1 ? "" : "s"
      } accessed`;
    case "billing.subscription_updated":
      return `${(meta as { from_tier?: string }).from_tier ?? "?"} → ${
        (meta as { to_tier?: string }).to_tier ?? "?"
      }`;
    case "billing.invoice_failed": {
      const amt = (meta as { amount_cents?: number }).amount_cents ?? null;
      return amt ? `$${(amt / 100).toFixed(2)} failed` : "Payment failed";
    }
    case "billing.invoice_paid": {
      const amt = (meta as { amount_cents?: number }).amount_cents ?? null;
      return amt ? `$${(amt / 100).toFixed(2)} paid` : "Payment ok";
    }
    case "kiosk.station_create":
    case "kiosk.station_revoke":
      return (meta as { name?: string }).name ?? "";
    default:
      return "";
  }
}

export default function ActivityPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryPrefix, setCategoryPrefix] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { append?: boolean } = {}) => {
      if (!user || !churchId) return;
      if (opts.append) {
        if (!nextCursor) return;
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({ church_id: churchId, limit: "50" });
        if (opts.append && nextCursor) params.set("cursor", nextCursor);
        const res = await fetch(`/api/admin/audit-logs?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load activity");
        }
        const data = await res.json();
        const incoming = data.entries as AuditEntry[];
        setEntries((prev) => (opts.append ? [...prev, ...incoming] : incoming));
        setNextCursor(data.next_cursor ?? null);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [user, churchId, nextCursor],
  );

  useEffect(() => {
    if (churchId && user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [churchId, user]);

  const filtered = categoryPrefix
    ? entries.filter((e) => e.action.startsWith(categoryPrefix))
    : entries;

  if (!isAdmin(activeMembership)) return <AccessDenied requiredRole="Admin" />;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-vc-indigo">Activity</h1>
        <p className="mt-1 text-vc-text-secondary">
          A record of significant events in your organization — schedule
          publishes, role changes, billing events, kiosk activity, and more.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {ACTION_CATEGORIES.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => setCategoryPrefix(c.prefix)}
            className={
              categoryPrefix === c.prefix
                ? "rounded-full bg-vc-coral px-3 py-1 text-sm font-medium text-white"
                : "rounded-full border border-vc-border-light bg-white px-3 py-1 text-sm font-medium text-vc-indigo transition-colors hover:bg-vc-bg-warm"
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-vc-coral/5 px-3 py-2 text-sm text-vc-coral">
          ⚠ {error}
        </p>
      )}

      {loading && entries.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-vc-border-light bg-vc-bg-warm p-12 text-center">
          <p className="text-vc-text-secondary">
            No activity yet in this category. Try another filter, or come back
            after schedules publish or kiosks are used.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-vc-border-light overflow-hidden rounded-xl border border-vc-border-light bg-white">
          {filtered.map((e) => {
            const sub = summary(e);
            return (
              <li key={e.id} className="flex items-start gap-4 px-5 py-3">
                <div
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    e.outcome === "ok"
                      ? "bg-vc-sage"
                      : e.outcome === "failed"
                        ? "bg-vc-coral"
                        : "bg-vc-warning"
                  }`}
                  title={e.outcome}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-vc-indigo">
                    {actionLabel(e.action)}
                    {sub && (
                      <span className="ml-2 text-vc-text-muted font-normal">
                        — {sub}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-vc-text-muted">
                    {formatActor(e.actor)} &middot; {formatRelative(e.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => load({ append: true })}
            disabled={loadingMore}
            className="rounded-lg border border-vc-border-light bg-white px-4 py-2 text-sm font-medium text-vc-indigo transition-colors hover:bg-vc-bg-warm disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load older"}
          </button>
        </div>
      )}

      <p className="mt-6 text-xs text-vc-text-muted">
        Activity records are append-only and retained indefinitely. They show
        the &ldquo;what&rdquo; — for the &ldquo;who&rdquo; behind a kiosk
        action, contact your church&apos;s VolunteerCal admin.
      </p>
    </div>
  );
}
