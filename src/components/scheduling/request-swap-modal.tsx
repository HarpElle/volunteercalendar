"use client";

/**
 * Wave 12 A — Request-Swap modal.
 *
 * Sibling to CantMakeItModal. Difference:
 *   - CantMakeItModal → /api/notify/absence (emails scheduler + admin)
 *   - RequestSwapModal → /api/swap (creates SwapRequest + broadcasts
 *     to ministry teammates so they can claim the shift WITHOUT
 *     scheduler involvement; scheduler only sees the FYI when
 *     someone accepts)
 *
 * For V1 we ship "sub-only" — the volunteer just opens the shift to
 * teammates. A future PR can add "swap" (propose one of their other
 * shifts in trade). The API supports the data shape already.
 */

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/context/auth-context";

interface RequestSwapModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (info: {
    swap_id: string;
    teammates_notified: number;
    teammates_emailed: number;
  }) => void;
  churchId: string;
  assignmentId: string;
  roleName: string;
  serviceName: string;
  serviceDate: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function RequestSwapModal({
  open,
  onClose,
  onCreated,
  churchId,
  assignmentId,
  roleName,
  serviceName,
  serviceDate,
}: RequestSwapModalProps) {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          church_id: churchId,
          assignment_id: assignmentId,
          reason: reason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not create swap request");
      }
      const data = (await res.json()) as {
        swap_id: string;
        teammates_notified: number;
        teammates_emailed: number;
      };
      onCreated(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Need a sub?">
      <div className="space-y-4">
        <p className="text-sm text-vc-text-secondary">
          We&rsquo;ll email your teammates on this team and let them
          know you need someone to cover. Any of them can claim it
          with one tap &mdash; the swap happens automatically. Your
          scheduler gets a heads-up once someone takes it.
        </p>

        <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm/50 p-4">
          <p className="text-sm font-medium text-vc-indigo">{roleName}</p>
          <p className="text-sm text-vc-text-secondary">{serviceName}</p>
          <p className="text-xs text-vc-text-muted">{formatDate(serviceDate)}</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-vc-text">
            Note for the team{" "}
            <span className="text-vc-text-muted">(optional)</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Out of town that weekend — happy to take a future date in trade."
            className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="text-sm text-vc-coral bg-vc-coral/5 border border-vc-coral/20 rounded-lg p-2"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-vc-border-light pt-4">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            Ask the team
          </Button>
        </div>
      </div>
    </Modal>
  );
}
