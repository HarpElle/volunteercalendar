"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { Volunteer, Assignment } from "@/lib/types";

// --- Helpers ---

type HealthCategory = "at_risk" | "declining" | "inactive" | "no_show" | "healthy";

interface VolunteerHealth {
  volunteer: Volunteer;
  category: HealthCategory;
  detail: string;
}

function classifyHealth(v: Volunteer, recentAssignments: Assignment[]): VolunteerHealth {
  const { stats, availability } = v;

  // No-show pattern: 2+ no-shows
  if (stats.no_show_count >= 2) {
    return {
      volunteer: v,
      category: "no_show",
      detail: `${stats.no_show_count} no-show${stats.no_show_count > 1 ? "s" : ""}`,
    };
  }

  // Declining: high decline count relative to scheduling
  if (stats.decline_count >= 3) {
    const rate = stats.times_scheduled_last_90d > 0
      ? Math.round((stats.decline_count / (stats.times_scheduled_last_90d + stats.decline_count)) * 100)
      : 100;
    return {
      volunteer: v,
      category: "declining",
      detail: `${stats.decline_count} decline${stats.decline_count > 1 ? "s" : ""} (${rate}% rate)`,
    };
  }

  // At-risk: scheduled more than preferred frequency
  if (
    availability.preferred_frequency > 0 &&
    stats.times_scheduled_last_90d > availability.preferred_frequency * 3 // 3 months at preferred rate
  ) {
    return {
      volunteer: v,
      category: "at_risk",
      detail: `Scheduled ${stats.times_scheduled_last_90d}× in 90d (prefers ${availability.preferred_frequency}/mo)`,
    };
  }

  // Inactive: not scheduled in 60+ days
  if (stats.last_served_date) {
    const daysSince = Math.floor(
      (Date.now() - new Date(stats.last_served_date).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSince >= 60) {
      return {
        volunteer: v,
        category: "inactive",
        detail: `Last served ${daysSince} days ago`,
      };
    }
  } else if (v.status === "active") {
    // Active volunteer who has never served
    return {
      volunteer: v,
      category: "inactive",
      detail: "Never scheduled",
    };
  }

  return {
    volunteer: v,
    category: "healthy",
    detail: `${stats.times_scheduled_last_90d}× in 90 days`,
  };
}

const CATEGORY_CONFIG: Record<HealthCategory, { label: string; color: string; badgeVariant: "danger" | "warning" | "accent" | "default" | "success"; icon: string }> = {
  no_show: { label: "No-Show Pattern", color: "vc-danger", badgeVariant: "danger", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" },
  declining: { label: "Declining", color: "vc-coral", badgeVariant: "warning", icon: "M15.75 9.75l-4.5 4.5m0-4.5l4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  at_risk: { label: "At Risk (Burnout)", color: "vc-sand", badgeVariant: "accent", icon: "M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" },
  inactive: { label: "Inactive (60+ days)", color: "vc-text-muted", badgeVariant: "default", icon: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  healthy: { label: "Healthy", color: "vc-sage", badgeVariant: "success", icon: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
};

const CATEGORY_TOOLTIPS: Record<HealthCategory, string> = {
  no_show: "2+ unexcused no-shows. Consider reaching out to check in.",
  declining: "3+ declined assignments. Their availability may have changed.",
  at_risk: "Scheduled more often than preferred. Reduce frequency to avoid burnout.",
  inactive: "60+ days since last service, or never scheduled. May need re-engagement.",
  healthy: "Regular participation with no concerning patterns.",
};

// --- Component ---

export default function VolunteerHealthPage() {
  const { profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [loading, setLoading] = useState(true);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    if (!churchId) { setLoading(false); return; }
    async function load() {
      try {
        const [volDocs, assignDocs] = await Promise.all([
          getChurchDocuments(churchId!, "volunteers"),
          getChurchDocuments(churchId!, "assignments"),
        ]);
        setVolunteers((volDocs as unknown as Volunteer[]).filter((v) => v.status === "active"));
        setAssignments(assignDocs as unknown as Assignment[]);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Classify all volunteers
  const healthData = volunteers.map((v) => classifyHealth(v, assignments));

  // Group by category
  const byCategory: Record<HealthCategory, VolunteerHealth[]> = {
    no_show: [],
    declining: [],
    at_risk: [],
    inactive: [],
    healthy: [],
  };
  for (const h of healthData) {
    byCategory[h.category].push(h);
  }

  const totalActive = volunteers.length;
  const needsAttention = healthData.filter((h) => h.category !== "healthy").length;
  const healthyCount = byCategory.healthy.length;
  const healthRate = totalActive > 0 ? Math.round((healthyCount / totalActive) * 100) : 100;

  // Top-level stats
  const stats = [
    { label: "Active Volunteers", value: totalActive, color: "text-vc-indigo" },
    { label: "Healthy", value: healthyCount, color: "text-vc-sage" },
    { label: "Needs Attention", value: needsAttention, color: needsAttention > 0 ? "text-vc-coral" : "text-vc-sage" },
    { label: "Health Rate", value: `${healthRate}%`, color: healthRate >= 80 ? "text-vc-sage" : healthRate >= 60 ? "text-vc-sand" : "text-vc-coral" },
  ];

  // Categories to display (skip empty ones, always show healthy last)
  const displayOrder: HealthCategory[] = ["no_show", "declining", "at_risk", "inactive"];

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-3xl text-vc-indigo">Volunteer Health</h1>
          <InfoTooltip text="Health classifications are based on scheduling frequency, decline patterns, no-shows, and time since last service. Categories update automatically." />
        </div>
        <p className="mt-1 text-vc-text-secondary">
          Monitor engagement, identify burnout risk, and keep your team thriving.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-vc-border-light bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-medium text-vc-text-muted">{s.label}</p>
            <p className={`mt-2 text-2xl font-semibold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Health Distribution Bar */}
      {totalActive > 0 && (
        <div className="mb-8 rounded-xl border border-vc-border-light bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-vc-indigo">Health Distribution</h2>
          <div className="flex h-4 overflow-hidden rounded-full bg-vc-border-light">
            {(["healthy", "at_risk", "declining", "no_show", "inactive"] as HealthCategory[]).map((cat) => {
              const count = byCategory[cat].length;
              if (count === 0) return null;
              const pct = (count / totalActive) * 100;
              const bgColors: Record<HealthCategory, string> = {
                healthy: "bg-vc-sage",
                at_risk: "bg-vc-sand",
                declining: "bg-vc-coral",
                no_show: "bg-vc-danger",
                inactive: "bg-vc-text-muted/40",
              };
              return (
                <div
                  key={cat}
                  className={`${bgColors[cat]} transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${CATEGORY_CONFIG[cat].label}: ${count}`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-vc-text-muted">
            {(["healthy", "at_risk", "declining", "no_show", "inactive"] as HealthCategory[]).map((cat) => {
              const count = byCategory[cat].length;
              if (count === 0) return null;
              return (
                <span key={cat} className="flex items-center gap-1.5">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${{
                    healthy: "bg-vc-sage",
                    at_risk: "bg-vc-sand",
                    declining: "bg-vc-coral",
                    no_show: "bg-vc-danger",
                    inactive: "bg-vc-text-muted/40",
                  }[cat]}`} />
                  {CATEGORY_CONFIG[cat].label} ({count})
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Category Sections — attention-needing categories */}
      {displayOrder.map((cat) => {
        const items = byCategory[cat];
        if (items.length === 0) return null;
        const config = CATEGORY_CONFIG[cat];

        return (
          <section key={cat} className="mb-6 rounded-xl border border-vc-border-light bg-white overflow-hidden shadow-sm">
            <div className="border-b border-vc-border-light px-5 py-3.5 flex items-center gap-3">
              <svg className={`h-5 w-5 text-${config.color}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
              </svg>
              <h2 className="font-semibold text-vc-indigo">{config.label}</h2>
              <InfoTooltip text={CATEGORY_TOOLTIPS[cat]} />
              <Badge variant={config.badgeVariant} className="ml-auto">{items.length}</Badge>
            </div>
            <div className="divide-y divide-vc-border-light">
              {items.map((h) => (
                <div key={h.volunteer.id} className="flex flex-col gap-2 px-5 py-3 hover:bg-vc-bg-warm transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-0">
                  <div className="min-w-0">
                    <p className="font-medium text-vc-indigo truncate">{h.volunteer.name}</p>
                    <p className="text-sm text-vc-text-muted truncate">{h.volunteer.email}</p>
                  </div>
                  <div className="ml-4 flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-sm text-vc-text-secondary">{h.detail}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-vc-text-muted">
                        <span>Scheduled: {h.volunteer.stats.times_scheduled_last_90d}×</span>
                        {h.volunteer.stats.decline_count > 0 && (
                          <span>Declined: {h.volunteer.stats.decline_count}</span>
                        )}
                        {h.volunteer.stats.no_show_count > 0 && (
                          <span>No-shows: {h.volunteer.stats.no_show_count}</span>
                        )}
                      </div>
                    </div>
                    <a
                      href={`mailto:${h.volunteer.email}?subject=Checking in — VolunteerCal`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-vc-text-muted hover:bg-vc-coral/10 hover:text-vc-coral transition-colors"
                      aria-label={`Email ${h.volunteer.name}`}
                      title={`Email ${h.volunteer.name}`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                      </svg>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {/* Healthy volunteers summary */}
      {byCategory.healthy.length > 0 && (
        <section className="mb-6 rounded-xl border border-vc-border-light bg-white overflow-hidden shadow-sm">
          <div className="border-b border-vc-border-light px-5 py-3.5 flex items-center gap-3">
            <svg className="h-5 w-5 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <h2 className="font-semibold text-vc-indigo">Healthy</h2>
            <Badge variant="success" className="ml-auto">{byCategory.healthy.length}</Badge>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-vc-text-secondary">
              {byCategory.healthy.length} volunteer{byCategory.healthy.length !== 1 ? "s" : ""} serving
              within their preferred frequency with no issues.
            </p>
            {byCategory.healthy.length <= 20 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {byCategory.healthy.map((h) => (
                  <span
                    key={h.volunteer.id}
                    className="inline-flex items-center rounded-full bg-vc-sage/10 px-3 py-1 text-xs font-medium text-vc-sage"
                  >
                    {h.volunteer.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Empty state */}
      {totalActive === 0 && (
        <div className="rounded-xl border border-dashed border-vc-border-light bg-vc-bg-warm p-12 text-center">
          <p className="text-vc-text-secondary">No active volunteers yet.</p>
          <Link
            href="/dashboard/people"
            className="mt-2 inline-block text-sm font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
          >
            Add volunteers to get started
          </Link>
        </div>
      )}
    </div>
  );
}
