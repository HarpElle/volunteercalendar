"use client";

import { useState } from "react";
import { updateDocument } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import type { Church } from "@/lib/types";

interface NotificationModeSectionProps {
  churchId: string;
  church: Church;
  setChurch: (church: Church) => void;
}

type NotificationMode = "live" | "in_app_only";

/**
 * Org-level notification gateway (Phase 4a). Owner-only.
 *
 * "live"        — default. All notification paths fire normally.
 * "in_app_only" — email + SMS suppressed at the eligibility resolver;
 *                 in-app inbox notifications still write.
 *
 * Primary use case: demo orgs + automated testing. A reviewer can
 * click through workflows that would otherwise fire real emails /
 * texts to seeded test accounts (and burn your Resend quota).
 */
export function NotificationModeSection({
  churchId,
  church,
  setChurch,
}: NotificationModeSectionProps) {
  const currentMode: NotificationMode =
    (church.settings?.notification_mode as NotificationMode | undefined) ??
    "live";

  const [pending, setPending] = useState<NotificationMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(
    null,
  );

  const selected: NotificationMode = pending ?? currentMode;
  const dirty = pending !== null && pending !== currentMode;

  async function handleSave() {
    if (!pending || pending === currentMode) return;
    setSaving(true);
    setStatus(null);
    try {
      const nextSettings = { ...(church.settings ?? {}), notification_mode: pending };
      await updateDocument("churches", churchId, { settings: nextSettings });
      setChurch({ ...church, settings: nextSettings });
      setStatus({ kind: "ok", msg: "Notification mode updated." });
      setPending(null);
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({
        kind: "err",
        msg: err instanceof Error ? err.message : "Save failed.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-vc-border-light bg-white p-6">
      <h2 className="font-display text-xl font-semibold text-vc-indigo">
        Notification mode
      </h2>
      <p className="mt-2 text-sm text-vc-text-secondary">
        Org-wide gate for outbound notifications. In-app inbox messages
        always work; this controls email and SMS only.
      </p>

      <div className="mt-4 space-y-3">
        <ModeOption
          value="live"
          label="Live"
          description="Default. Email, SMS, and in-app notifications all fire normally."
          selected={selected === "live"}
          onSelect={() => setPending("live")}
        />
        <ModeOption
          value="in_app_only"
          label="In-app only"
          description="Email and SMS are suppressed. In-app inbox notifications still write. Use for demo/test orgs so you don't burn email quota or spam test accounts."
          selected={selected === "in_app_only"}
          onSelect={() => setPending("in_app_only")}
        />
      </div>

      {selected === "in_app_only" && (
        <div className="mt-4 rounded-xl border border-vc-coral/30 bg-vc-coral/5 p-4 text-sm text-vc-indigo">
          <strong className="block font-semibold">Heads up:</strong>
          While in this mode, none of your volunteers, schedulers, or
          parents will receive email or SMS — schedule publishes,
          reminders, absence alerts, swap requests, kids check-in
          notifications, and pre-check-in pages will all be silent
          outside the app.
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        <Button
          size="sm"
          onClick={handleSave}
          loading={saving}
          disabled={!dirty || saving}
        >
          Save notification mode
        </Button>
        {status?.kind === "ok" && (
          <span className="text-sm text-vc-sage">{status.msg}</span>
        )}
        {status?.kind === "err" && (
          <span className="text-sm text-vc-coral">{status.msg}</span>
        )}
      </div>
    </section>
  );
}

function ModeOption({
  label,
  description,
  selected,
  onSelect,
}: {
  value: NotificationMode;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl border p-4 transition-colors min-h-[44px] ${
        selected
          ? "border-vc-indigo bg-vc-indigo/5"
          : "border-vc-border-light bg-white hover:bg-vc-bg-warm"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
            selected
              ? "border-vc-indigo bg-vc-indigo"
              : "border-vc-border-light bg-white"
          }`}
          aria-hidden="true"
        >
          {selected && (
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
          )}
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-vc-indigo">{label}</span>
          <span className="mt-0.5 block text-sm text-vc-text-secondary">
            {description}
          </span>
        </span>
      </div>
    </button>
  );
}
