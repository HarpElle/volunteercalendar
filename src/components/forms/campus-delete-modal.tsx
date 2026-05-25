"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/context/auth-context";
import type { Campus } from "@/lib/types";

/**
 * Pass H Phase 5: Campus delete safeguards.
 *
 * The bare `confirm("Delete this campus?")` flow this replaces would
 * orphan every reference (services, events, people, calendar feeds)
 * still scoped to the campus. This modal instead:
 *   1. fetches an audit of what references the campus
 *   2. asks the admin whether to reassign references to another
 *      campus OR convert them to org-wide (campus_id null)
 *   3. calls the cascade DELETE endpoint
 *   4. surfaces success/failure clearly
 *
 * When the campus has NO references, the picker is hidden and the
 * primary button label becomes a plain "Delete campus" — same UX
 * as the old confirm dialog, just with safer copy.
 *
 * Per user signoff:
 *   - Calendar feeds ALWAYS go to null (avoids silently re-pointing
 *     a user's iCal subscription)
 *   - The last remaining campus is deletable when mode === "convert"
 *     (org returns to single-campus, sidebar selector hides itself)
 */

interface AuditCounts {
  services: number;
  events: number;
  people: number;
  calendar_feeds: number;
}

interface AuditResponse {
  campus_id: string;
  campus_name: string;
  counts: AuditCounts;
  total: number;
}

interface CampusDeleteModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after successful delete so the parent can update its state. */
  onDeleted: (campusId: string) => void;
  churchId: string;
  campus: Campus;
  /** All campuses in the church, INCLUDING the one being deleted. The picker excludes the target itself. */
  allCampuses: Campus[];
}

export function CampusDeleteModal({
  open,
  onClose,
  onDeleted,
  churchId,
  campus,
  allCampuses,
}: CampusDeleteModalProps) {
  const { user } = useAuth();
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"reassign" | "convert">("convert");
  const [targetCampusId, setTargetCampusId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Other campuses (the picker can't target the one being deleted).
  const otherCampuses = allCampuses.filter((c) => c.id !== campus.id);

  // Default the picker to the primary campus when reassign mode kicks in
  // and the admin hasn't picked one yet.
  useEffect(() => {
    if (mode === "reassign" && !targetCampusId && otherCampuses.length > 0) {
      const primary = otherCampuses.find((c) => c.is_primary);
      setTargetCampusId(primary?.id ?? otherCampuses[0].id);
    }
  }, [mode, targetCampusId, otherCampuses]);

  // Fetch audit when modal opens; reset state when it closes.
  useEffect(() => {
    if (!open) {
      setAudit(null);
      setError(null);
      setMode("convert");
      setTargetCampusId("");
      return;
    }
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `/api/campuses/${campus.id}?church_id=${churchId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(data.error || "Failed to load campus audit");
          }
          return;
        }
        const data = (await res.json()) as AuditResponse;
        if (!cancelled) setAudit(data);
      } catch {
        if (!cancelled) setError("Failed to load campus audit");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, churchId, campus.id]);

  async function handleConfirm() {
    if (!user) return;
    if (mode === "reassign" && !targetCampusId) {
      setError("Pick a target campus or switch to convert-to-org-wide.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/campuses/${campus.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          church_id: churchId,
          mode,
          target_campus_id: mode === "reassign" ? targetCampusId : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete campus");
        return;
      }
      onDeleted(campus.id);
      onClose();
    } catch {
      setError("Failed to delete campus. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const total = audit?.total ?? 0;
  const hasReferences = total > 0;
  const isLastCampus = allCampuses.length === 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Delete "${campus.name}"`}
      subtitle="This will remove the campus from your organization. Choose how to handle anything still scoped to it."
      maxWidth="max-w-xl"
    >
      <div className="space-y-5">
        {loading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}

        {!loading && audit && (
          <>
            {/* Reference summary */}
            <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm/40 p-4">
              <p className="text-sm font-medium text-vc-indigo">
                {hasReferences ? "Currently scoped to this campus:" : "Nothing is scoped to this campus."}
              </p>
              {hasReferences && (
                <ul className="mt-2 space-y-1 text-sm text-vc-text-secondary">
                  {audit.counts.services > 0 && (
                    <li>📅 {audit.counts.services} service{audit.counts.services !== 1 ? "s" : ""}</li>
                  )}
                  {audit.counts.events > 0 && (
                    <li>🎟️ {audit.counts.events} event{audit.counts.events !== 1 ? "s" : ""}</li>
                  )}
                  {audit.counts.people > 0 && (
                    <li>👥 {audit.counts.people} {audit.counts.people === 1 ? "person" : "people"}</li>
                  )}
                  {audit.counts.calendar_feeds > 0 && (
                    <li>📡 {audit.counts.calendar_feeds} calendar feed{audit.counts.calendar_feeds !== 1 ? "s" : ""}</li>
                  )}
                </ul>
              )}
            </div>

            {/* Mode picker — only shown when there's something to reassign/convert */}
            {hasReferences && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-vc-text">What should happen to these?</p>

                {/* Reassign option */}
                {otherCampuses.length > 0 && (
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                      mode === "reassign"
                        ? "border-vc-coral bg-vc-coral/5"
                        : "border-vc-border-light hover:border-vc-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name="campus-delete-mode"
                      value="reassign"
                      checked={mode === "reassign"}
                      onChange={() => setMode("reassign")}
                      className="mt-1 accent-vc-coral"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-vc-indigo">
                        Reassign to another campus
                      </p>
                      <p className="mt-0.5 text-xs text-vc-text-muted">
                        Services, events, and people move to the campus you pick below.
                        Calendar feeds always convert to &ldquo;All campuses&rdquo;
                        (subscriptions aren&rsquo;t silently re-pointed).
                      </p>
                      {mode === "reassign" && (
                        <select
                          value={targetCampusId}
                          onChange={(e) => setTargetCampusId(e.target.value)}
                          className="mt-2 w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                        >
                          {otherCampuses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.is_primary ? `${c.name} — Primary` : c.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </label>
                )}

                {/* Convert-to-org-wide option */}
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                    mode === "convert"
                      ? "border-vc-coral bg-vc-coral/5"
                      : "border-vc-border-light hover:border-vc-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="campus-delete-mode"
                    value="convert"
                    checked={mode === "convert"}
                    onChange={() => setMode("convert")}
                    className="mt-1 accent-vc-coral"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-vc-indigo">
                      Convert to org-wide
                    </p>
                    <p className="mt-0.5 text-xs text-vc-text-muted">
                      Services, events, and feeds become &ldquo;All campuses&rdquo;.
                      People with no other campus assignment become universal
                      (visible under every future campus view).
                    </p>
                    {isLastCampus && mode === "convert" && (
                      <p className="mt-2 text-xs font-medium text-vc-coral">
                        This is your last campus. Your org will return to
                        single-campus mode and the campus selector will hide itself.
                      </p>
                    )}
                  </div>
                </label>
              </div>
            )}

            {/* Errors */}
            {error && (
              <p className="rounded-lg bg-vc-danger/10 px-3 py-2 text-sm text-vc-danger">
                {error}
              </p>
            )}

            {/* Action row */}
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={submitting}
                onClick={handleConfirm}
              >
                {hasReferences
                  ? mode === "reassign"
                    ? "Reassign and delete"
                    : "Convert and delete"
                  : "Delete campus"}
              </Button>
            </div>
          </>
        )}

        {!loading && !audit && error && (
          <>
            <p className="rounded-lg bg-vc-danger/10 px-3 py-2 text-sm text-vc-danger">
              {error}
            </p>
            <div className="flex justify-end pt-2">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
