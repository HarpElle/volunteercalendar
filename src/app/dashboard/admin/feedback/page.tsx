"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import type {
  FeedbackItem,
  FeedbackCategory,
  FeedbackStatus,
  FeedbackPriority,
  FeedbackDisposition,
} from "@/lib/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<FeedbackCategory, { label: string; icon: string }> = {
  bug: { label: "Bug", icon: "M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Z" },
  pain_point: { label: "Frustration", icon: "M15.182 16.318A4.486 4.486 0 0 0 12.016 15a4.486 4.486 0 0 0-3.198 1.318M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  feature_request: { label: "Feature", icon: "M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" },
  idea: { label: "Idea", icon: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12" },
  question: { label: "Question", icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" },
};

const STATUS_OPTIONS: { value: FeedbackStatus; label: string; variant: "default" | "warning" | "accent" | "success" | "danger" }[] = [
  { value: "submitted", label: "Submitted", variant: "default" },
  { value: "acknowledged", label: "Acknowledged", variant: "accent" },
  { value: "triaged", label: "Triaged", variant: "accent" },
  { value: "in_progress", label: "In Progress", variant: "warning" },
  { value: "resolved", label: "Resolved", variant: "success" },
  { value: "wont_do", label: "Won't Do", variant: "danger" },
  { value: "duplicate", label: "Duplicate", variant: "default" },
];

const PRIORITY_OPTIONS: { value: FeedbackPriority; label: string; color: string }[] = [
  { value: "critical", label: "Critical", color: "bg-vc-danger text-white" },
  { value: "high", label: "High", color: "bg-vc-coral text-white" },
  { value: "medium", label: "Medium", color: "bg-vc-sand text-vc-indigo" },
  { value: "low", label: "Low", color: "bg-vc-border-light text-vc-text-secondary" },
  { value: "unset", label: "Unset", color: "bg-vc-bg-warm text-vc-text-muted" },
];

const DISPOSITION_OPTIONS: { value: FeedbackDisposition | "none"; label: string }[] = [
  { value: "none", label: "None" },
  { value: "consider", label: "Consider" },
  { value: "planned", label: "Planned" },
  { value: "shipped", label: "Shipped" },
  { value: "ignore", label: "Ignore" },
  { value: "exclude", label: "Exclude" },
];

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminFeedbackPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");

  // Inline edit state for selected item
  const [editResponse, setEditResponse] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [activities, setActivities] = useState<Array<{ id: string; type: string; actor_name: string; previous_value: string; new_value: string; created_at: string }>>([]);

  const loadFeedback = useCallback(async () => {
    if (!churchId || !user) return;
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ church_id: churchId, scope: "all" });
      if (filterStatus) params.set("status", filterStatus);
      if (filterCategory) params.set("category", filterCategory);
      const res = await fetch(`/api/feedback?${params}`, {
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
  }, [churchId, user, filterStatus, filterCategory]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  const updateFeedback = useCallback(
    async (feedbackId: string, updates: Record<string, unknown>) => {
      if (!churchId || !user) return;
      setSaving(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/feedback", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ church_id: churchId, feedback_id: feedbackId, ...updates }),
        });
        if (res.ok) {
          const updated = await res.json();
          setItems((prev) => prev.map((i) => (i.id === feedbackId ? { ...i, ...updated } : i)));
          if (selected?.id === feedbackId) {
            setSelected((prev) => prev ? { ...prev, ...updated } : null);
          }
        }
      } catch {
        // silent
      } finally {
        setSaving(false);
      }
    },
    [churchId, user, selected],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const openCount = items.filter((i) => !["resolved", "wont_do", "duplicate"].includes(i.status)).length;
  const criticalCount = items.filter((i) => i.priority === "critical" && i.status !== "resolved").length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">Feedback Triage</h1>
          <p className="mt-1 text-vc-text-secondary">
            {openCount} open &middot; {criticalCount > 0 ? `${criticalCount} critical` : "no critical items"}
          </p>
        </div>
        <Link
          href="/dashboard/admin/feedback/insights"
          className="rounded-lg border border-vc-border px-4 py-2 text-sm font-medium text-vc-text-secondary hover:bg-vc-bg-warm transition-colors"
        >
          Insights
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm text-vc-indigo"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm text-vc-indigo"
        >
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([val, cfg]) => (
            <option key={val} value={val}>{cfg.label}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-6">
        {/* List */}
        <div className={`flex-1 space-y-2 ${selected ? "hidden lg:block lg:max-w-md" : ""}`}>
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-vc-border-light bg-vc-bg-warm p-12 text-center">
              <p className="text-vc-text-secondary">No feedback items yet.</p>
            </div>
          ) : (
            items.map((item) => {
              const catCfg = CATEGORY_LABELS[item.category];
              const priCfg = PRIORITY_OPTIONS.find((p) => p.value === item.priority)!;
              const statusCfg = STATUS_OPTIONS.find((s) => s.value === item.status)!;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelected(item);
                    setEditResponse(item.admin_response || "");
                    setEditNotes(item.internal_notes || "");
                    // Load activity timeline
                    if (user && churchId) {
                      user.getIdToken().then((token) =>
                        fetch(`/api/feedback/activity?church_id=${churchId}&feedback_id=${item.id}`, {
                          headers: { Authorization: `Bearer ${token}` },
                        }).then((r) => r.ok ? r.json() : { activities: [] })
                          .then((d) => setActivities(d.activities || []))
                          .catch(() => setActivities([]))
                      );
                    }
                  }}
                  className={`w-full text-left rounded-xl border p-4 transition-colors ${
                    selected?.id === item.id
                      ? "border-vc-coral bg-vc-coral/5"
                      : "border-vc-border-light bg-white hover:bg-vc-bg-warm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-semibold uppercase text-vc-text-muted">
                          {catCfg.label}
                        </span>
                        {item.is_sunday_incident && (
                          <span className="text-[10px] font-bold text-vc-danger uppercase">Sunday</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-vc-indigo truncate">{item.title}</p>
                      <p className="mt-0.5 text-xs text-vc-text-muted truncate">
                        {item.submitted_by_name} &middot; {timeAgo(item.created_at)}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${priCfg.color}`}>
                        {priCfg.label}
                      </span>
                      <Badge variant={statusCfg.variant} className="text-[10px]">{statusCfg.label}</Badge>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="flex-1 rounded-xl border border-vc-border-light bg-white shadow-sm overflow-hidden">
            {/* Detail Header */}
            <div className="border-b border-vc-border-light px-5 py-4 flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold uppercase text-vc-text-muted">
                    {CATEGORY_LABELS[selected.category].label}
                  </span>
                  {selected.is_sunday_incident && (
                    <Badge variant="danger">Sunday Incident</Badge>
                  )}
                </div>
                <h2 className="font-display text-xl text-vc-indigo">{selected.title}</h2>
                <p className="mt-1 text-xs text-vc-text-muted">
                  By {selected.submitted_by_name} ({selected.submitted_by_role}) &middot;{" "}
                  {new Date(selected.created_at).toLocaleDateString()} at{" "}
                  {new Date(selected.created_at).toLocaleTimeString()}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-vc-text-muted hover:bg-vc-bg-warm transition-colors lg:hidden"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Description */}
              <div>
                <h3 className="text-xs font-semibold uppercase text-vc-text-muted mb-1">Description</h3>
                <p className="text-sm text-vc-text-secondary whitespace-pre-wrap">{selected.description}</p>
              </div>

              {/* Steps to Reproduce */}
              {selected.steps_to_reproduce && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-vc-text-muted mb-1">Steps to Reproduce</h3>
                  <p className="text-sm text-vc-text-secondary whitespace-pre-wrap">{selected.steps_to_reproduce}</p>
                </div>
              )}

              {/* Context */}
              {selected.page_url && (
                <div className="text-xs text-vc-text-muted">
                  Submitted from: <code className="bg-vc-bg-warm px-1.5 py-0.5 rounded">{selected.page_url}</code>
                </div>
              )}

              {/* Triage Controls */}
              <div className="border-t border-vc-border-light pt-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase text-vc-text-muted">Triage</h3>

                {/* Priority */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-vc-text-secondary w-20">Priority</span>
                  <div className="flex flex-wrap gap-1.5">
                    {PRIORITY_OPTIONS.filter((p) => p.value !== "unset").map((p) => (
                      <button
                        key={p.value}
                        onClick={() => updateFeedback(selected.id, { priority: p.value })}
                        disabled={saving}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                          selected.priority === p.value
                            ? p.color + " ring-2 ring-offset-1 ring-vc-coral/30"
                            : "bg-vc-bg-warm text-vc-text-muted hover:opacity-80"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-vc-text-secondary w-20">Status</span>
                  <select
                    value={selected.status}
                    onChange={(e) => updateFeedback(selected.id, { status: e.target.value })}
                    disabled={saving}
                    className="rounded-lg border border-vc-border-light bg-white px-3 py-1.5 text-sm text-vc-indigo"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Disposition */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-vc-text-secondary w-20">Decision</span>
                  <select
                    value={selected.disposition || "none"}
                    onChange={(e) => updateFeedback(selected.id, {
                      disposition: e.target.value === "none" ? null : e.target.value,
                    })}
                    disabled={saving}
                    className="rounded-lg border border-vc-border-light bg-white px-3 py-1.5 text-sm text-vc-indigo"
                  >
                    {DISPOSITION_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>

                {/* Tags */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-vc-text-secondary w-20">Tags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-vc-indigo/10 px-2.5 py-0.5 text-xs font-medium text-vc-indigo">
                        {tag}
                      </span>
                    ))}
                    {selected.tags.length === 0 && (
                      <span className="text-xs text-vc-text-muted">No tags</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Admin Response */}
              <div className="border-t border-vc-border-light pt-4">
                <h3 className="text-xs font-semibold uppercase text-vc-text-muted mb-2">
                  Response to User
                  <span className="font-normal ml-1">(visible to submitter)</span>
                </h3>
                <textarea
                  value={editResponse}
                  onChange={(e) => setEditResponse(e.target.value)}
                  placeholder="Write a response..."
                  rows={3}
                  className="w-full rounded-lg border border-vc-border-light bg-white px-3.5 py-2.5 text-sm text-vc-indigo placeholder:text-vc-text-muted/60 focus:border-vc-coral focus:outline-none focus:ring-1 focus:ring-vc-coral resize-y"
                />
                <button
                  onClick={() => {
                    if (editResponse.trim()) {
                      updateFeedback(selected.id, { admin_response: editResponse.trim() });
                    }
                  }}
                  disabled={saving || !editResponse.trim()}
                  className="mt-2 rounded-lg bg-vc-coral px-4 py-2 text-sm font-semibold text-white hover:bg-vc-coral/90 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving..." : "Send Response"}
                </button>
              </div>

              {/* Internal Notes (admin-only) */}
              <div className="border-t border-vc-border-light pt-4">
                <h3 className="text-xs font-semibold uppercase text-vc-text-muted mb-2">
                  Internal Notes
                  <span className="font-normal ml-1">(admin-only, not visible to submitter)</span>
                </h3>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Private notes about this item..."
                  rows={3}
                  className="w-full rounded-lg border border-vc-border-light bg-vc-bg-warm/50 px-3.5 py-2.5 text-sm text-vc-indigo placeholder:text-vc-text-muted/60 focus:border-vc-indigo/50 focus:outline-none focus:ring-1 focus:ring-vc-indigo/30 resize-y"
                />
                {editNotes !== (selected.internal_notes || "") && (
                  <button
                    onClick={() => updateFeedback(selected.id, { internal_notes: editNotes.trim() || null })}
                    disabled={saving}
                    className="mt-2 rounded-lg border border-vc-border px-4 py-2 text-sm font-medium text-vc-indigo hover:bg-vc-bg-warm disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Saving..." : "Save Notes"}
                  </button>
                )}
              </div>

              {/* Activity Timeline */}
              {activities.length > 0 && (
                <div className="border-t border-vc-border-light pt-4">
                  <h3 className="text-xs font-semibold uppercase text-vc-text-muted mb-3">Activity</h3>
                  <div className="space-y-2">
                    {activities.map((a) => (
                      <div key={a.id} className="flex gap-2 text-xs text-vc-text-muted">
                        <span className="shrink-0 text-vc-text-secondary font-medium">
                          {a.actor_name || "System"}
                        </span>
                        <span>
                          {a.type.replace(/_/g, " ")}
                          {a.previous_value && a.new_value ? (
                            <> from <em>{a.previous_value}</em> to <strong className="text-vc-indigo">{a.new_value}</strong></>
                          ) : a.new_value ? (
                            <> → <strong className="text-vc-indigo">{a.new_value}</strong></>
                          ) : null}
                        </span>
                        <span className="ml-auto shrink-0">{timeAgo(a.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
