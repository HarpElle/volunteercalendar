"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/context/auth-context";

interface SelfRemoveModalProps {
  open: boolean;
  onClose: () => void;
  onRemoved: () => void;
  churchId: string;
  itemType: "assignment" | "event_signup";
  itemId: string;
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

export function SelfRemoveModal({
  open,
  onClose,
  onRemoved,
  churchId,
  itemType,
  itemId,
  roleName,
  serviceName,
  serviceDate,
}: SelfRemoveModalProps) {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const idToken = await user?.getIdToken();
      if (!idToken) return;
      const res = await fetch("/api/roster/self-remove", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          church_id: churchId,
          item_type: itemType,
          item_id: itemId,
          note: note.trim() || undefined,
        }),
      });
      if (res.ok) {
        onRemoved();
        onClose();
      }
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Remove Yourself?">
      <div className="space-y-4">
        <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm/50 p-4">
          <p className="text-sm font-medium text-vc-indigo">{roleName}</p>
          <p className="text-sm text-vc-text-secondary">{serviceName}</p>
          <p className="text-xs text-vc-text-muted">{formatDate(serviceDate)}</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-vc-text">
            Let your scheduler know why <span className="text-vc-text-muted">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Out of town that weekend..."
            className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-vc-border-light pt-4">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            className="!bg-vc-danger !hover:bg-vc-danger/90"
          >
            Confirm Removal
          </Button>
        </div>
      </div>
    </Modal>
  );
}
