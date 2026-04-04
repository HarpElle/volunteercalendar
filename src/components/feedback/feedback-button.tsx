"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { usePathname } from "next/navigation";
import type { FeedbackCategory } from "@/lib/types";

// ─── Category Config ─────────────────────────────────────────────────────────

const CATEGORIES: { value: FeedbackCategory; label: string; icon: string; placeholder: string }[] = [
  {
    value: "bug",
    label: "Bug",
    icon: "M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152-6.135c-.22-2.058-1.665-3.664-3.563-4.168a4.11 4.11 0 0 0-1.473-.163m-2.038 0a4.11 4.11 0 0 0-1.473.163c-1.898.504-3.343 2.11-3.563 4.168A23.91 23.91 0 0 1 3.793 14.19 24.479 24.479 0 0 1 12 12.75Zm0 0V9",
    placeholder: "What went wrong?",
  },
  {
    value: "pain_point",
    label: "Frustration",
    icon: "M15.182 16.318A4.486 4.486 0 0 0 12.016 15a4.486 4.486 0 0 0-3.198 1.318M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z",
    placeholder: "What's frustrating?",
  },
  {
    value: "feature_request",
    label: "Feature",
    icon: "M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18",
    placeholder: "What do you wish it could do?",
  },
  {
    value: "idea",
    label: "Idea",
    icon: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z",
    placeholder: "What's your idea?",
  },
  {
    value: "question",
    label: "Question",
    icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z",
    placeholder: "What do you need help with?",
  },
];

const PRIORITY_OPTIONS = [
  { value: "critical", label: "Blocking me right now", color: "text-vc-danger" },
  { value: "high", label: "Important but not urgent", color: "text-vc-coral" },
  { value: "low", label: "Just a thought", color: "text-vc-text-muted" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function FeedbackButton() {
  const { user, profile, activeMembership } = useAuth();
  const pathname = usePathname();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [open, setOpen] = useState(false);
  const [sundayMode, setSundayMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [priority, setPriority] = useState("");

  const resetForm = useCallback(() => {
    setCategory("bug");
    setTitle("");
    setDescription("");
    setStepsToReproduce("");
    setPriority("");
    setError(null);
    setSubmitted(false);
    setSundayMode(false);
  }, []);

  const handleOpen = useCallback((sunday = false) => {
    resetForm();
    if (sunday) {
      setSundayMode(true);
      setCategory("bug");
    }
    setOpen(true);
  }, [resetForm]);

  const handleClose = useCallback(() => {
    setOpen(false);
    // Reset after animation
    setTimeout(resetForm, 300);
  }, [resetForm]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !description.trim() || !churchId || !user) return;

    setSubmitting(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          category,
          title: title.trim(),
          description: description.trim(),
          steps_to_reproduce: category === "bug" && stepsToReproduce.trim() ? stepsToReproduce.trim() : null,
          expected_behavior: null,
          page_url: pathname,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          is_sunday_incident: sundayMode,
          priority_suggestion: sundayMode ? "critical" : priority || "unset",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }, [title, description, churchId, user, category, stepsToReproduce, sundayMode, priority, pathname]);

  // Don't show on unauthenticated pages or without org
  if (!user || !churchId) return null;

  // Don't show on kiosk pages
  if (pathname.startsWith("/kiosk")) return null;

  const currentCategory = CATEGORIES.find((c) => c.value === category)!;

  return (
    <>
      {/* Floating Button */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        <button
          onClick={() => handleOpen(false)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-vc-coral text-white shadow-lg transition-all hover:bg-vc-coral/90 hover:scale-105 active:scale-95"
          aria-label="Send feedback"
          title="Send feedback"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
          </svg>
        </button>
      </div>

      {/* Modal Overlay */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-vc-border-light bg-white px-5 py-4 rounded-t-2xl">
              <h2 className="font-display text-lg text-vc-indigo">
                {sundayMode ? "Sunday Incident Report" : "Send Feedback"}
              </h2>
              <button
                onClick={handleClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-vc-text-muted hover:bg-vc-bg-warm transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {submitted ? (
              /* Success State */
              <div className="p-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-vc-sage/15">
                  <svg className="h-7 w-7 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <h3 className="font-display text-xl text-vc-indigo">Thank you!</h3>
                <p className="mt-2 text-sm text-vc-text-secondary">
                  {sundayMode
                    ? "Your incident report has been flagged for immediate review."
                    : "Your feedback has been submitted. We'll review it soon."}
                </p>
                <button
                  onClick={handleClose}
                  className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-vc-coral px-6 text-sm font-semibold text-white transition-colors hover:bg-vc-coral/90"
                >
                  Done
                </button>
              </div>
            ) : (
              /* Form */
              <div className="p-5 space-y-4">
                {sundayMode && (
                  <div className="rounded-lg bg-vc-danger/5 border border-vc-danger/20 px-4 py-3">
                    <p className="text-sm font-medium text-vc-danger">
                      Sunday Incident Mode — this will be flagged as critical priority.
                    </p>
                  </div>
                )}

                {/* Category Selector (hidden in Sunday mode) */}
                {!sundayMode && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-vc-indigo">Category</label>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat.value}
                          onClick={() => setCategory(cat.value)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                            category === cat.value
                              ? "border-vc-coral bg-vc-coral/5 text-vc-coral"
                              : "border-vc-border-light text-vc-text-secondary hover:border-vc-coral/30"
                          }`}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d={cat.icon} />
                          </svg>
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Title */}
                <div>
                  <label htmlFor="fb-title" className="mb-1.5 block text-sm font-medium text-vc-indigo">
                    Title
                  </label>
                  <input
                    id="fb-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={sundayMode ? "Brief description of the issue" : currentCategory.placeholder}
                    className="w-full rounded-lg border border-vc-border-light bg-white px-3.5 py-2.5 text-sm text-vc-indigo placeholder:text-vc-text-muted/60 focus:border-vc-coral focus:outline-none focus:ring-1 focus:ring-vc-coral"
                    maxLength={200}
                  />
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="fb-desc" className="mb-1.5 block text-sm font-medium text-vc-indigo">
                    Details
                  </label>
                  <textarea
                    id="fb-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={
                      sundayMode
                        ? "What happened? What were you trying to do?"
                        : "Tell us more..."
                    }
                    rows={3}
                    className="w-full rounded-lg border border-vc-border-light bg-white px-3.5 py-2.5 text-sm text-vc-indigo placeholder:text-vc-text-muted/60 focus:border-vc-coral focus:outline-none focus:ring-1 focus:ring-vc-coral resize-y"
                  />
                </div>

                {/* Steps to Reproduce (bugs only, not Sunday mode) */}
                {category === "bug" && !sundayMode && (
                  <div>
                    <label htmlFor="fb-steps" className="mb-1.5 block text-sm font-medium text-vc-indigo">
                      Steps to Reproduce <span className="text-vc-text-muted font-normal">(optional)</span>
                    </label>
                    <textarea
                      id="fb-steps"
                      value={stepsToReproduce}
                      onChange={(e) => setStepsToReproduce(e.target.value)}
                      placeholder="1. Go to&#10;2. Click on&#10;3. See error"
                      rows={3}
                      className="w-full rounded-lg border border-vc-border-light bg-white px-3.5 py-2.5 text-sm text-vc-indigo placeholder:text-vc-text-muted/60 focus:border-vc-coral focus:outline-none focus:ring-1 focus:ring-vc-coral resize-y"
                    />
                  </div>
                )}

                {/* Priority (not in Sunday mode — always critical) */}
                {!sundayMode && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-vc-indigo">
                      How urgent? <span className="text-vc-text-muted font-normal">(optional)</span>
                    </label>
                    <div className="space-y-1.5">
                      {PRIORITY_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                            priority === opt.value
                              ? "border-vc-coral bg-vc-coral/5"
                              : "border-vc-border-light hover:border-vc-coral/30"
                          }`}
                        >
                          <input
                            type="radio"
                            name="priority"
                            value={opt.value}
                            checked={priority === opt.value}
                            onChange={(e) => setPriority(e.target.value)}
                            className="accent-vc-coral"
                          />
                          <span className={`text-sm ${priority === opt.value ? "text-vc-indigo font-medium" : opt.color}`}>
                            {opt.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="rounded-lg bg-vc-danger/5 border border-vc-danger/20 px-4 py-2.5">
                    <p className="text-sm text-vc-danger">{error}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-3 pt-2">
                  {!sundayMode && (
                    <button
                      onClick={() => handleOpen(true)}
                      className="text-xs text-vc-danger hover:underline"
                      title="Simplified form for critical Sunday morning issues"
                    >
                      Sunday Report
                    </button>
                  )}
                  <div className="flex gap-2 ml-auto">
                    <button
                      onClick={handleClose}
                      className="rounded-lg border border-vc-border-light px-4 py-2.5 text-sm font-medium text-vc-text-secondary hover:bg-vc-bg-warm transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={!title.trim() || !description.trim() || submitting}
                      className="rounded-lg bg-vc-coral px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-vc-coral/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? "Submitting..." : sundayMode ? "Report Incident" : "Submit"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
