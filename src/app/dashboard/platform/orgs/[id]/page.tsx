"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import type { SubscriptionTier } from "@/lib/types";
import type { OrgRiskSignals, OrgSnapshot } from "@/lib/types/platform";

const TIER_BADGE: Record<
  SubscriptionTier,
  { variant: "default" | "warning" | "accent" | "success" | "danger" }
> = {
  free: { variant: "default" },
  starter: { variant: "accent" },
  growth: { variant: "warning" },
  pro: { variant: "success" },
  enterprise: { variant: "danger" },
};

const RISK_LABEL: Record<keyof OrgRiskSignals, string> = {
  dormant_14d: "Dormant 14d",
  dormant_30d: "Dormant 30d",
  dormant_60d: "Dormant 60d",
  free_tier_paid_feature_attempted: "Free tier configured paid feature",
  payment_failed: "Payment failed",
  subscription_past_due: "Subscription past due",
  abandoned_signup: "Abandoned signup",
};

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function PlatformOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null);
  const [snapshot, setSnapshot] = useState<OrgSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const token = await user!.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };

        const meRes = await fetch("/api/platform/me", { headers });
        const meData = await meRes.json();
        setIsPlatformAdmin(meData.is_platform_admin);
        if (!meData.is_platform_admin) {
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/platform/orgs/${id}`, { headers });
        if (res.status === 404) {
          setNotFound(true);
        } else if (res.ok) {
          const data = await res.json();
          setSnapshot(data.snapshot);
        }
      } catch (err) {
        console.error("[Platform Org Detail] Load failed:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, id]);

  async function handleRecompute() {
    if (!user || refreshing) return;
    setRefreshing(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/platform/orgs/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data.snapshot);
      }
    } catch (err) {
      console.error("[Recompute] Failed:", err);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-vc-text-secondary">
          You don&apos;t have access to this page.
        </p>
      </div>
    );
  }

  if (notFound || !snapshot) {
    return (
      <div className="rounded-xl border border-dashed border-vc-border-light bg-vc-bg-warm p-8 text-center">
        <p className="text-vc-text-secondary">
          Organization not found, or no snapshot has been computed yet.
        </p>
        <Link
          href="/dashboard/platform/orgs"
          className="mt-4 inline-block text-sm text-vc-coral hover:underline"
        >
          ← Back to Organizations
        </Link>
      </div>
    );
  }

  const s = snapshot;
  const activeRisks = (Object.entries(s.risk) as Array<[keyof OrgRiskSignals, boolean]>)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard/platform/orgs"
          className="text-sm text-vc-coral hover:underline"
        >
          ← Organizations
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">{s.name || "(unnamed org)"}</h1>
          <p className="mt-1 flex items-center gap-3 text-sm text-vc-text-secondary">
            <span>{s.slug}</span>
            <Badge variant={TIER_BADGE[s.tier]?.variant || "default"}>{s.tier}</Badge>
            <span>Created {formatDate(s.created_at)}</span>
          </p>
        </div>
        <button
          onClick={handleRecompute}
          disabled={refreshing}
          className="rounded-lg bg-vc-coral px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-vc-coral/90 disabled:opacity-50"
        >
          {refreshing ? "Recomputing..." : "Recompute snapshot"}
        </button>
      </div>

      {/* At-risk banner */}
      {activeRisks.length > 0 && (
        <div className="mb-4 rounded-xl border border-vc-coral/30 bg-vc-coral/5 p-4">
          <p className="text-sm font-semibold text-vc-coral">Risk signals</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {activeRisks.map((r) => (
              <span
                key={r}
                className="rounded-full bg-vc-coral/15 px-3 py-1 text-xs font-semibold text-vc-coral"
              >
                {RISK_LABEL[r] ?? r}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Owner */}
        <Card title="Owner">
          <Field label="Name" value={s.owner.display_name || "—"} />
          <Field label="Email" value={s.owner.email || "—"} mono />
          <Field label="Last sign-in" value={formatRelative(s.owner.last_sign_in_at)} />
          <Field label="UID" value={s.owner.uid || "—"} mono small />
        </Card>

        {/* Activity */}
        <Card title="Activity">
          <Field label="Last active" value={formatRelative(s.last_active_at)} />
          <Field label="Status" value={s.status} />
          <Field label="Snapshot computed" value={formatRelative(s.computed_at)} />
        </Card>

        {/* Members */}
        <Card title="Members">
          <Field label="Total active" value={String(s.memberships.total_active)} />
          <Field label="Owners" value={String(s.memberships.owner)} />
          <Field label="Admins" value={String(s.memberships.admin)} />
          <Field label="Schedulers" value={String(s.memberships.scheduler)} />
          <Field label="Volunteers" value={String(s.memberships.volunteer)} />
          <Field label="Pending invites" value={String(s.memberships.pending_invite)} />
          <Field label="Pending self-join" value={String(s.memberships.pending_self_join)} />
          <Field label="Inactive" value={String(s.memberships.inactive)} />
        </Card>

        {/* Configuration */}
        <Card title="Configuration">
          <ConfigRow ok={s.configuration.has_services} label="Services" count={s.counts.services} />
          <ConfigRow ok={s.configuration.has_worship_plans} label="Worship plans" count={s.counts.service_plans} />
          <ConfigRow ok={s.configuration.has_rooms} label="Rooms" count={s.counts.rooms} />
          <ConfigRow ok={s.configuration.has_calendar_feeds} label="Calendar feeds" count={s.counts.calendar_feeds} />
          <ConfigRow ok={s.configuration.has_short_links} label="Short links" count={s.counts.short_links} />
          <ConfigRow ok={s.counts.ministries > 0} label="Ministries" count={s.counts.ministries} />
          <ConfigRow ok={s.configuration.has_facility_groups} label="Facility groups" />
        </Card>

        {/* Children's data presence */}
        <Card title="Children's check-in" tone={s.children_presence.children > 0 && s.tier === "free" ? "warning" : undefined}>
          <ConfigRow ok={s.configuration.has_checkin_settings} label="Check-in configured" />
          <ConfigRow ok={s.configuration.has_kiosks} label="Kiosks" count={s.counts.printers} />
          <ConfigRow ok={s.counts.checkin_rooms > 0} label="Check-in rooms" count={s.counts.checkin_rooms} />
          <Field label="Children" value={String(s.children_presence.children)} />
          <Field label="Households" value={String(s.children_presence.households)} />
          <Field label="Sessions (24h)" value={String(s.children_presence.sessions_24h)} />
          <Field label="Sessions (7d)" value={String(s.children_presence.sessions_7d)} />
          <Field label="Sessions (total)" value={String(s.children_presence.sessions_total)} />
          {s.children_presence.any_medical_notes_set && (
            <p className="mt-2 text-xs text-vc-warning">
              ⚠ Medical/allergy notes recorded on at least one child
            </p>
          )}
        </Card>

        {/* Sparkline placeholder */}
        <Card title="30-day activity">
          <Sparkline label="Check-ins / day" values={s.recent_activity.sessions_by_day} />
          <Sparkline label="Schedule updates / day" values={s.recent_activity.assignments_by_day} />
          <Sparkline label="New members / day" values={s.recent_activity.members_added_by_day} />
        </Card>
      </div>

      <p className="mt-6 text-xs text-vc-text-muted">
        Org id: <code className="text-[10px]">{s.id}</code> &middot; Subscription source:{" "}
        {s.subscription_source}
      </p>
    </div>
  );
}

function Card({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "warning";
}) {
  const border =
    tone === "warning"
      ? "border-vc-warning/40 bg-vc-warning/5"
      : "border-vc-border-light bg-white";
  return (
    <div className={`rounded-xl border p-5 ${border}`}>
      <h2 className="mb-3 font-semibold text-vc-indigo">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-vc-text-muted">{label}</span>
      <span
        className={`text-right text-vc-indigo ${mono ? "font-mono" : ""} ${small ? "text-[10px]" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function ConfigRow({ ok, label, count }: { ok: boolean; label: string; count?: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-vc-text-muted">
        <span className={ok ? "text-vc-sage" : "text-vc-text-muted/50"}>
          {ok ? "✓" : "○"}
        </span>{" "}
        {label}
      </span>
      <span className="text-right text-vc-indigo">
        {count !== undefined ? count : ok ? "yes" : "—"}
      </span>
    </div>
  );
}

function Sparkline({ label, values }: { label: string; values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs text-vc-text-muted">{label}</p>
      <div className="flex h-10 items-end gap-0.5">
        {values.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-vc-coral/30"
            style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 2 : 0 }}
            title={`${v} on day -${values.length - 1 - i}`}
          />
        ))}
      </div>
      <p className="text-[10px] text-vc-text-muted">
        Total: {values.reduce((a, b) => a + b, 0)}
      </p>
    </div>
  );
}
