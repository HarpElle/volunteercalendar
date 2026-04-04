"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";
import type { FeedbackItem, FeedbackCategory, FeedbackPriority, FeedbackStatus } from "@/lib/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bugs",
  pain_point: "Pain Points",
  feature_request: "Feature Requests",
  idea: "Ideas",
  question: "Questions",
};

const PRIORITY_COLORS: Record<FeedbackPriority, string> = {
  critical: "bg-vc-danger",
  high: "bg-vc-coral",
  medium: "bg-vc-sand",
  low: "bg-vc-border-light",
  unset: "bg-vc-bg-warm",
};

const OPEN_STATUSES: FeedbackStatus[] = ["submitted", "acknowledged", "triaged", "in_progress"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FeedbackInsightsPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FeedbackItem[]>([]);

  const loadFeedback = useCallback(async () => {
    if (!churchId || !user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/feedback?church_id=${churchId}&scope=all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items as FeedbackItem[]);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [churchId, user]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // ─── Compute Analytics ───

  // 1. Category breakdown
  const byCat: Record<string, number> = {};
  for (const item of items) {
    byCat[item.category] = (byCat[item.category] || 0) + 1;
  }
  const categoryEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCatCount = Math.max(...Object.values(byCat), 1);

  // 2. Open backlog by priority
  const openItems = items.filter((i) => OPEN_STATUSES.includes(i.status));
  const byPriority: Record<string, number> = {};
  for (const item of openItems) {
    byPriority[item.priority] = (byPriority[item.priority] || 0) + 1;
  }

  // 3. Average resolution time
  const resolvedItems = items.filter((i) => i.resolved_at);
  const avgResDays = resolvedItems.length > 0
    ? Math.round(resolvedItems.reduce((sum, i) => sum + daysBetween(i.created_at, i.resolved_at!), 0) / resolvedItems.length)
    : null;

  // 4. Average time to acknowledge
  const ackedItems = items.filter((i) => i.acknowledged_at);
  const avgAckDays = ackedItems.length > 0
    ? Math.round(ackedItems.reduce((sum, i) => sum + daysBetween(i.created_at, i.acknowledged_at!), 0) / ackedItems.length)
    : null;

  // 5. Most-tagged areas
  const tagCounts: Record<string, number> = {};
  for (const item of items) {
    for (const tag of item.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // 6. Product planning: items with disposition "consider" or "planned"
  const planningItems = items.filter(
    (i) => i.disposition === "consider" || i.disposition === "planned",
  );

  // 7. Sunday incidents
  const sundayItems = items.filter((i) => i.is_sunday_incident);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">Feedback Insights</h1>
          <p className="mt-1 text-vc-text-secondary">
            {items.length} total items &middot; {openItems.length} open
          </p>
        </div>
        <Link
          href="/dashboard/admin/feedback"
          className="rounded-lg border border-vc-border px-4 py-2 text-sm font-medium text-vc-text-secondary hover:bg-vc-bg-warm transition-colors"
        >
          Triage Dashboard
        </Link>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="rounded-xl border border-vc-border-light bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-vc-text-muted">Open Items</p>
          <p className="mt-1 font-display text-3xl text-vc-indigo">{openItems.length}</p>
        </div>
        <div className="rounded-xl border border-vc-border-light bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-vc-text-muted">Avg Resolution</p>
          <p className="mt-1 font-display text-3xl text-vc-indigo">
            {avgResDays !== null ? `${avgResDays}d` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-vc-border-light bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-vc-text-muted">Avg Acknowledge</p>
          <p className="mt-1 font-display text-3xl text-vc-indigo">
            {avgAckDays !== null ? `${avgAckDays}d` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-vc-border-light bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-vc-text-muted">Sunday Incidents</p>
          <p className="mt-1 font-display text-3xl text-vc-danger">{sundayItems.length}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category Distribution */}
        <div className="rounded-xl border border-vc-border-light bg-white p-5">
          <h2 className="font-display text-lg text-vc-indigo mb-4">By Category</h2>
          <div className="space-y-3">
            {categoryEntries.map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-sm text-vc-text-secondary w-28 shrink-0">
                  {CATEGORY_LABELS[cat as FeedbackCategory] || cat}
                </span>
                <div className="flex-1 h-6 rounded-full bg-vc-bg-warm overflow-hidden">
                  <div
                    className="h-full rounded-full bg-vc-coral/70 transition-all"
                    style={{ width: `${(count / maxCatCount) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-vc-indigo w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Open Backlog by Priority */}
        <div className="rounded-xl border border-vc-border-light bg-white p-5">
          <h2 className="font-display text-lg text-vc-indigo mb-4">Open by Priority</h2>
          {openItems.length === 0 ? (
            <p className="text-sm text-vc-text-muted">No open items.</p>
          ) : (
            <div className="flex gap-3 flex-wrap">
              {(["critical", "high", "medium", "low", "unset"] as FeedbackPriority[]).map((pri) => {
                const count = byPriority[pri] || 0;
                if (count === 0) return null;
                return (
                  <div
                    key={pri}
                    className="flex items-center gap-2 rounded-xl border border-vc-border-light px-4 py-3"
                  >
                    <div className={`h-3 w-3 rounded-full ${PRIORITY_COLORS[pri]}`} />
                    <span className="text-sm font-medium text-vc-text-secondary capitalize">{pri}</span>
                    <span className="font-display text-xl text-vc-indigo">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Tags */}
        <div className="rounded-xl border border-vc-border-light bg-white p-5">
          <h2 className="font-display text-lg text-vc-indigo mb-4">Top Tags</h2>
          {topTags.length === 0 ? (
            <p className="text-sm text-vc-text-muted">No tagged items yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topTags.map(([tag, count]) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 rounded-full bg-vc-indigo/10 px-3 py-1.5 text-sm font-medium text-vc-indigo"
                >
                  {tag}
                  <span className="rounded-full bg-vc-indigo/20 px-1.5 py-0.5 text-[10px] font-bold">{count}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Product Planning Pipeline */}
        <div className="rounded-xl border border-vc-border-light bg-white p-5">
          <h2 className="font-display text-lg text-vc-indigo mb-4">Planning Pipeline</h2>
          <p className="text-xs text-vc-text-muted mb-3">Items marked &quot;Consider&quot; or &quot;Planned&quot;</p>
          {planningItems.length === 0 ? (
            <p className="text-sm text-vc-text-muted">No items in pipeline.</p>
          ) : (
            <div className="space-y-2">
              {planningItems.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-vc-border-light px-3 py-2"
                >
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      item.disposition === "planned"
                        ? "bg-vc-sage/20 text-vc-sage"
                        : "bg-vc-sand/30 text-vc-warning"
                    }`}
                  >
                    {item.disposition}
                  </span>
                  <span className="text-sm text-vc-text-secondary truncate flex-1">{item.title}</span>
                  <span className="text-[10px] font-semibold uppercase text-vc-text-muted">
                    {CATEGORY_LABELS[item.category]}
                  </span>
                </div>
              ))}
              {planningItems.length > 10 && (
                <p className="text-xs text-vc-text-muted">+ {planningItems.length - 10} more</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
