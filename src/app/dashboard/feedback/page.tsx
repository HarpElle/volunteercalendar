"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import type { FeedbackItem, FeedbackCategory, FeedbackStatus } from "@/lib/types";

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug",
  pain_point: "Frustration",
  feature_request: "Feature Request",
  idea: "Idea",
  question: "Question",
};

const STATUS_CONFIG: Record<FeedbackStatus, { label: string; variant: "default" | "warning" | "accent" | "success" | "danger" }> = {
  submitted: { label: "Submitted", variant: "default" },
  acknowledged: { label: "Acknowledged", variant: "accent" },
  triaged: { label: "Under Review", variant: "accent" },
  in_progress: { label: "In Progress", variant: "warning" },
  resolved: { label: "Resolved", variant: "success" },
  wont_do: { label: "Won't Do", variant: "danger" },
  duplicate: { label: "Duplicate", variant: "default" },
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

export default function MyFeedbackPage() {
  const { user, profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!churchId || !user) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch(
          `/api/feedback?church_id=${encodeURIComponent(churchId!)}&scope=mine`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const data = await res.json();
          setItems(data.items as FeedbackItem[]);
        } else {
          console.error("[My Feedback] API returned", res.status);
          setError(true);
        }
      } catch (err) {
        console.error("[My Feedback] Load failed:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId, user]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">My Feedback</h1>
        <p className="mt-1 text-vc-text-secondary">
          Track the status of your submitted feedback and feature requests.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-dashed border-vc-danger/30 bg-vc-danger/5 p-12 text-center">
          <p className="text-vc-text-secondary">
            Unable to load your feedback. Please try refreshing the page.
          </p>
          <button
            onClick={() => { setError(false); setLoading(true); window.location.reload(); }}
            className="mt-3 rounded-lg bg-vc-coral px-4 py-2 text-sm font-semibold text-white hover:bg-vc-coral/90 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-vc-border-light bg-vc-bg-warm p-12 text-center">
          <svg className="mx-auto h-10 w-10 text-vc-text-muted/40" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
          </svg>
          <p className="mt-3 text-vc-text-secondary">
            No feedback submitted yet. Use the{" "}
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-vc-coral text-white text-xs font-bold">?</span>
            {" "}button to share a bug report, idea, or question.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const statusConfig = STATUS_CONFIG[item.status];
            return (
              <div
                key={item.id}
                className="rounded-xl border border-vc-border-light bg-white p-5 transition-colors hover:bg-vc-bg-warm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-vc-text-muted uppercase">
                        {CATEGORY_LABELS[item.category]}
                      </span>
                      {item.is_sunday_incident && (
                        <Badge variant="danger">Sunday Incident</Badge>
                      )}
                    </div>
                    <h3 className="font-medium text-vc-indigo">{item.title}</h3>
                    <p className="mt-1 text-sm text-vc-text-secondary line-clamp-2">
                      {item.description}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                    <p className="mt-1 text-xs text-vc-text-muted">{timeAgo(item.created_at)}</p>
                  </div>
                </div>

                {/* Admin Response */}
                {item.admin_response && (
                  <div className="mt-3 rounded-lg bg-vc-sage/5 border border-vc-sage/20 px-4 py-3">
                    <p className="text-xs font-medium text-vc-sage mb-1">Response from team</p>
                    <p className="text-sm text-vc-text-secondary">{item.admin_response}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
