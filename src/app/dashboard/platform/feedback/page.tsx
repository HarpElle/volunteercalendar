"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import type {
  FeedbackItem,
  FeedbackCategory,
  FeedbackPriority,
  FeedbackDisposition,
} from "@/lib/types";

type PlatformFeedbackStatus = "pending" | "reviewing" | "planned" | "shipped" | "wont_fix";

const DISPOSITION_OPTIONS: { value: FeedbackDisposition | "none"; label: string }[] = [
  { value: "none", label: "None" },
  { value: "consider", label: "Consider" },
  { value: "planned", label: "Planned" },
  { value: "shipped", label: "Shipped" },
  { value: "ignore", label: "Ignore" },
  { value: "exclude", label: "Exclude" },
];

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug",
  pain_point: "Frustration",
  feature_request: "Feature Request",
  idea: "Idea",
  question: "Question",
};

const PLATFORM_STATUS_CONFIG: Record<
  PlatformFeedbackStatus,
  { label: string; variant: "default" | "warning" | "accent" | "success" | "danger" }
> = {
  pending: { label: "Pending", variant: "default" },
  reviewing: { label: "Reviewing", variant: "accent" },
  planned: { label: "Planned", variant: "warning" },
  shipped: { label: "Shipped", variant: "success" },
  wont_fix: { label: "Won't Fix", variant: "danger" },
};

const PRIORITY_COLORS: Record<FeedbackPriority, string> = {
  critical: "text-red-600 bg-red-50 border-red-200",
  high: "text-orange-600 bg-orange-50 border-orange-200",
  medium: "text-yellow-600 bg-yellow-50 border-yellow-200",
  low: "text-vc-text-muted bg-vc-bg-warm border-vc-border-light",
  unset: "text-vc-text-muted bg-vc-bg border-vc-border-light",
};

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

// Extended type with org_name from platform API
interface PlatformFeedbackItem extends FeedbackItem {
  org_name?: string;
}

export default function PlatformFeedbackPage() {
  const { user } = useAuth();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PlatformFeedbackItem[]>([]);
  const [selected, setSelected] = useState<PlatformFeedbackItem | null>(null);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterPlatformStatus, setFilterPlatformStatus] = useState<string>("");

  // Edit state
  const [editPlatformStatus, setEditPlatformStatus] = useState<string>("");
  const [editPlatformPriority, setEditPlatformPriority] = useState<string>("");
  const [editDisposition, setEditDisposition] = useState<string>("none");
  const [editPlatformResponse, setEditPlatformResponse] = useState("");
  const [editPlatformNotes, setEditPlatformNotes] = useState("");
  const [responseSent, setResponseSent] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [saving, setSaving] = useState(false);

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

        const res = await fetch("/api/platform/feedback?platform_only=true", { headers });
        if (res.ok) {
          const data = await res.json();
          setItems(data.items || []);
        }
      } catch (err) {
        console.error("[Platform Feedback] Load failed:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  function selectItem(item: PlatformFeedbackItem) {
    setSelected(item);
    setEditPlatformStatus(item.platform_status || "pending");
    setEditPlatformPriority(item.platform_priority || item.priority || "unset");
    setEditDisposition(item.disposition || "none");
    setEditPlatformResponse("");
    setEditPlatformNotes(item.platform_internal_notes || "");
    setResponseSent(false);
    setNotesSaved(false);
  }

  async function updatePlatformField(updates: Record<string, unknown>) {
    if (!user || !selected) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/platform/feedback", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: selected.church_id,
          feedback_id: selected.id,
          ...updates,
        }),
      });
      if (res.ok) {
        // Update local state
        const updated = { ...selected, ...updates } as PlatformFeedbackItem;
        setSelected(updated);
        setItems((prev) =>
          prev.map((i) => (i.id === selected.id ? updated : i)),
        );
      }
    } catch (err) {
      console.error("[Platform Feedback] Update failed:", err);
    } finally {
      setSaving(false);
    }
  }

  // Filtered items
  const filtered = items.filter((i) => {
    if (filterCategory && i.category !== filterCategory) return false;
    if (filterPlatformStatus) {
      const ps = i.platform_status || "pending";
      if (ps !== filterPlatformStatus) return false;
    }
    return true;
  });

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
        <p className="text-vc-text-secondary">You don&apos;t have access to this page.</p>
      </div>
    );
  }

  const openCount = items.filter(
    (i) => !["shipped", "wont_fix"].includes(i.platform_status || ""),
  ).length;
  const criticalCount = items.filter(
    (i) =>
      (i.platform_priority || i.priority) === "critical" &&
      !["shipped", "wont_fix"].includes(i.platform_status || ""),
  ).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-vc-indigo">Platform Feedback</h1>
        <p className="mt-1 text-vc-text-secondary">
          Bugs and feature requests from all organizations.
          <span className="ml-3 font-semibold text-vc-indigo">{openCount} open</span>
          {criticalCount > 0 && (
            <span className="ml-2 font-semibold text-red-600">{criticalCount} critical</span>
          )}
        </p>
      </div>

      <div className="flex gap-6">
        {/* Left: list */}
        <div className={`w-full space-y-2 ${selected ? "hidden lg:block lg:w-2/5" : ""}`}>
          {/* Filters */}
          <div className="mb-3 flex gap-2">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-lg border border-vc-border-light bg-white px-3 py-1.5 text-sm"
            >
              <option value="">All Categories</option>
              <option value="bug">Bug</option>
              <option value="feature_request">Feature Request</option>
              <option value="pain_point">Frustration</option>
              <option value="idea">Idea</option>
              <option value="question">Question</option>
            </select>
            <select
              value={filterPlatformStatus}
              onChange={(e) => setFilterPlatformStatus(e.target.value)}
              className="rounded-lg border border-vc-border-light bg-white px-3 py-1.5 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="reviewing">Reviewing</option>
              <option value="planned">Planned</option>
              <option value="shipped">Shipped</option>
              <option value="wont_fix">Won&apos;t Fix</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-vc-border-light bg-vc-bg-warm p-8 text-center">
              <p className="text-vc-text-secondary">No platform feedback items found.</p>
            </div>
          ) : (
            filtered.map((item) => {
              const isActive = selected?.id === item.id;
              const pStatus = item.platform_status || "pending";
              const psConfig = PLATFORM_STATUS_CONFIG[pStatus as PlatformFeedbackStatus];
              return (
                <button
                  key={item.id}
                  onClick={() => selectItem(item)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    isActive
                      ? "border-vc-coral bg-vc-coral/5"
                      : "border-vc-border-light bg-white hover:bg-vc-bg-warm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-semibold uppercase text-vc-text-muted">
                          {CATEGORY_LABELS[item.category]}
                        </span>
                        <span className="text-[10px] text-vc-coral font-medium">
                          {item.org_name || "Unknown Org"}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-vc-indigo truncate">
                        {item.title}
                      </p>
                      <p className="text-xs text-vc-text-muted mt-0.5">
                        {item.submitted_by_name} &middot; {timeAgo(item.created_at)}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {psConfig && (
                        <Badge variant={psConfig.variant}>{psConfig.label}</Badge>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right: detail */}
        {selected && (
          <div className="w-full lg:w-3/5">
            {/* Back button (mobile) */}
            <button
              onClick={() => setSelected(null)}
              className="mb-3 text-sm text-vc-coral lg:hidden"
            >
              &larr; Back to list
            </button>

            <div className="rounded-xl border border-vc-border-light bg-white p-6 space-y-5">
              {/* Header */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold uppercase text-vc-text-muted">
                    {CATEGORY_LABELS[selected.category]}
                  </span>
                  <span className="text-xs text-vc-coral font-medium">
                    {selected.org_name || "Unknown Org"}
                  </span>
                  {selected.is_sunday_incident && (
                    <Badge variant="danger">Sunday Incident</Badge>
                  )}
                </div>
                <h2 className="text-xl font-semibold text-vc-indigo">{selected.title}</h2>
                <p className="text-xs text-vc-text-muted mt-1">
                  Submitted by {selected.submitted_by_name} ({selected.submitted_by_role}) &middot;{" "}
                  {timeAgo(selected.created_at)}
                </p>
              </div>

              {/* Description */}
              <div>
                <p className="text-sm text-vc-text-secondary whitespace-pre-wrap">
                  {selected.description}
                </p>
                {selected.steps_to_reproduce && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-vc-text-muted mb-1">
                      Steps to Reproduce
                    </p>
                    <p className="text-sm text-vc-text-secondary whitespace-pre-wrap">
                      {selected.steps_to_reproduce}
                    </p>
                  </div>
                )}
                {selected.expected_behavior && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-vc-text-muted mb-1">
                      Expected Behavior
                    </p>
                    <p className="text-sm text-vc-text-secondary whitespace-pre-wrap">
                      {selected.expected_behavior}
                    </p>
                  </div>
                )}
                {selected.page_url && (
                  <p className="mt-2 text-xs text-vc-text-muted">
                    Page: {selected.page_url}
                  </p>
                )}
              </div>

              {/* Org-level triage context (read-only) */}
              <div className="rounded-lg bg-vc-bg-warm border border-vc-border-light px-4 py-3">
                <p className="text-xs font-semibold text-vc-text-muted mb-2">
                  Org Admin Triage
                </p>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span>
                    Status: <strong>{selected.status}</strong>
                  </span>
                  <span>
                    Priority: <strong>{selected.priority}</strong>
                  </span>
                  {selected.disposition && (
                    <span>
                      Disposition: <strong>{selected.disposition}</strong>
                    </span>
                  )}
                  {selected.admin_response && (
                    <span>Admin responded</span>
                  )}
                </div>
              </div>

              {/* Platform Priority */}
              <div>
                <p className="text-xs font-semibold text-vc-text-muted mb-2">
                  Platform Priority
                </p>
                <div className="flex gap-1.5">
                  {(["critical", "high", "medium", "low"] as FeedbackPriority[]).map(
                    (p) => (
                      <button
                        key={p}
                        onClick={() => {
                          setEditPlatformPriority(p);
                          updatePlatformField({ platform_priority: p });
                        }}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                          editPlatformPriority === p
                            ? PRIORITY_COLORS[p]
                            : "border-vc-border-light text-vc-text-muted hover:bg-vc-bg-warm"
                        }`}
                      >
                        {p}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {/* Platform Status */}
              <div>
                <p className="text-xs font-semibold text-vc-text-muted mb-2">
                  Platform Status
                </p>
                <select
                  value={editPlatformStatus}
                  onChange={(e) => {
                    setEditPlatformStatus(e.target.value);
                    updatePlatformField({ platform_status: e.target.value });
                  }}
                  className="rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm"
                >
                  <option value="pending">Pending</option>
                  <option value="reviewing">Reviewing</option>
                  <option value="planned">Planned</option>
                  <option value="shipped">Shipped</option>
                  <option value="wont_fix">Won&apos;t Fix</option>
                </select>
              </div>

              {/* Product Decision */}
              <div>
                <p className="text-xs font-semibold text-vc-text-muted mb-2">
                  Decision
                  <span className="ml-1 font-normal text-vc-text-muted">
                    (product roadmap disposition)
                  </span>
                </p>
                <select
                  value={editDisposition}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditDisposition(val);
                    updatePlatformField({
                      disposition: val === "none" ? null : val,
                    });
                  }}
                  className="rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm"
                >
                  {DISPOSITION_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Platform Response (visible to org admins) */}
              <div>
                <p className="text-xs font-semibold text-vc-text-muted mb-2">
                  Response to Org
                  <span className="ml-1 font-normal text-vc-text-muted">
                    (visible to org admins)
                  </span>
                </p>
                {selected.platform_response && (
                  <div className="mb-2 rounded-lg bg-vc-sage/5 border border-vc-sage/20 px-4 py-3">
                    <p className="text-sm text-vc-text-secondary">
                      {selected.platform_response}
                    </p>
                    {selected.platform_response_at && (
                      <p className="text-xs text-vc-text-muted mt-1">
                        Sent {timeAgo(selected.platform_response_at)}
                      </p>
                    )}
                  </div>
                )}
                <textarea
                  value={editPlatformResponse}
                  onChange={(e) => setEditPlatformResponse(e.target.value)}
                  placeholder="Write a response visible to org admins..."
                  rows={3}
                  className="w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm placeholder:text-vc-text-muted/60 focus:border-vc-coral focus:outline-none"
                />
                <div className="mt-2 flex items-center gap-3">
                  <button
                    disabled={!editPlatformResponse.trim() || saving}
                    onClick={async () => {
                      await updatePlatformField({
                        platform_response: editPlatformResponse.trim(),
                      });
                      setEditPlatformResponse("");
                      setResponseSent(true);
                      setTimeout(() => setResponseSent(false), 3000);
                    }}
                    className="rounded-lg bg-vc-coral px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-vc-coral/90 disabled:opacity-50"
                  >
                    Send Response
                  </button>
                  {responseSent && (
                    <span className="flex items-center gap-1 text-sm text-vc-sage">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      Response sent
                    </span>
                  )}
                </div>
              </div>

              {/* Platform Internal Notes */}
              <div>
                <p className="text-xs font-semibold text-vc-text-muted mb-2">
                  Internal Notes
                  <span className="ml-1 font-normal text-vc-text-muted">
                    (platform admin only)
                  </span>
                </p>
                <textarea
                  value={editPlatformNotes}
                  onChange={(e) => setEditPlatformNotes(e.target.value)}
                  placeholder="Private notes for platform team..."
                  rows={3}
                  className="w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm placeholder:text-vc-text-muted/60 focus:border-vc-coral focus:outline-none"
                />
                {editPlatformNotes !== (selected.platform_internal_notes || "") && (
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      disabled={saving}
                      onClick={async () => {
                        await updatePlatformField({
                          platform_internal_notes: editPlatformNotes,
                        });
                        setNotesSaved(true);
                        setTimeout(() => setNotesSaved(false), 3000);
                      }}
                      className="rounded-lg border border-vc-border-light bg-white px-4 py-2 text-sm font-semibold text-vc-indigo transition-colors hover:bg-vc-bg-warm"
                    >
                      Save Notes
                    </button>
                    {notesSaved && (
                      <span className="flex items-center gap-1 text-sm text-vc-sage">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                        Saved
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
