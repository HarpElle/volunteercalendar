"use client";

/**
 * <MedicalVisibilitySection> — Wave 9 P0-4 sub-PR C.
 *
 * Admin UI for the per-field medical-data visibility config that
 * gates how allergies / medical_notes / medications appear on the
 * three surfaces:
 *   - the printed child label
 *   - the kiosk roster (with tap-to-reveal as an option)
 *   - admin reports
 *
 * Data path mirrors the existing settings section pattern (ERT, etc.):
 *   GET  /api/admin/checkin/settings?church_id=...
 *   PUT  /api/admin/checkin/settings  (body: { medical_visibility })
 *
 * Server returns 400 on a malformed shape — we mirror the same
 * validation client-side so the toggle UI can never construct an
 * invalid payload, and rely on the server as the source of truth.
 *
 * Default-on-empty: if the church hasn't saved a config yet, we
 * present the DEFAULT_MEDICAL_VISIBILITY preset (show everything,
 * no tap-to-expand) so the toggles match the current behavior.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  DEFAULT_MEDICAL_VISIBILITY,
  type MedicalField,
  type MedicalVisibility,
} from "@/lib/server/medical-visibility";

interface MedicalVisibilitySectionProps {
  churchId: string;
}

const FIELD_LABELS: Record<MedicalField, string> = {
  allergies: "Allergies",
  medical_notes: "Medical notes",
  medications: "Medications",
};

const FIELD_HINTS: Record<MedicalField, string> = {
  allergies:
    "Severe allergens (peanuts, shellfish, etc.). Recommended visible on the printed label so any volunteer who picks up the child can see it instantly.",
  medical_notes:
    "Conditions like asthma, diabetes, anxiety. Often more sensitive than allergens — many churches hide from the printed label and gate behind tap-to-reveal on the roster.",
  medications:
    "Active medications with the child (inhaler, epinephrine, prescription meds). Treat similarly to medical notes; some churches prefer roster-only with tap-to-reveal.",
};

function clone(v: MedicalVisibility): MedicalVisibility {
  return JSON.parse(JSON.stringify(v));
}

function equals(a: MedicalVisibility, b: MedicalVisibility): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function MedicalVisibilitySection({
  churchId,
}: MedicalVisibilitySectionProps) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [original, setOriginal] = useState<MedicalVisibility>(
    DEFAULT_MEDICAL_VISIBILITY,
  );
  const [draft, setDraft] = useState<MedicalVisibility>(
    DEFAULT_MEDICAL_VISIBILITY,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !churchId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/settings?church_id=${encodeURIComponent(churchId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error("Could not load settings");
      const data = (await res.json()) as {
        settings: { medical_visibility?: MedicalVisibility | null } | null;
      };
      const v = data.settings?.medical_visibility ?? DEFAULT_MEDICAL_VISIBILITY;
      setOriginal(clone(v));
      setDraft(clone(v));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user, churchId]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(field: MedicalField, key: keyof MedicalVisibility["allergies"]) {
    setDraft((d) => {
      const next = clone(d);
      next[field][key] = !next[field][key];
      return next;
    });
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/checkin/settings", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          medical_visibility: draft,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Save failed");
      }
      setOriginal(clone(draft));
      setSavedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setDraft(clone(DEFAULT_MEDICAL_VISIBILITY));
  }

  const dirty = !equals(original, draft);

  if (loading) {
    return (
      <section className="rounded-2xl border border-vc-border-light bg-white p-6">
        <Spinner />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-vc-border-light bg-white p-6 space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold text-vc-indigo">
          Medical privacy
        </h2>
        <p className="text-sm text-vc-text-secondary mt-1">
          Choose how each medical field appears at check-in. Allergies are
          recommended on the printed label so any responding adult sees them
          fast; more sensitive details like medications and medical notes can
          be hidden from the label and gated behind tap-to-reveal on the
          kiosk roster.
        </p>
      </div>

      {error && (
        <p className="text-xs text-vc-danger">{error}</p>
      )}

      <div className="space-y-4">
        {(Object.keys(FIELD_LABELS) as MedicalField[]).map((field) => (
          <div
            key={field}
            className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-4"
          >
            <div className="mb-2">
              <p className="font-medium text-vc-indigo">{FIELD_LABELS[field]}</p>
              <p className="text-xs text-vc-text-secondary mt-1">
                {FIELD_HINTS[field]}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={draft[field].label}
                  onChange={() => toggle(field, "label")}
                  className="h-5 w-5"
                />
                Show on printed label
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={draft[field].roster}
                  onChange={() => toggle(field, "roster")}
                  className="h-5 w-5"
                />
                Show on kiosk roster
              </label>
              <label
                className={`flex items-center gap-2 text-sm cursor-pointer min-h-[44px] ${
                  draft[field].roster ? "" : "opacity-50 pointer-events-none"
                }`}
              >
                <input
                  type="checkbox"
                  checked={draft[field].expand_on_tap_only}
                  onChange={() => toggle(field, "expand_on_tap_only")}
                  disabled={!draft[field].roster}
                  className="h-5 w-5"
                />
                Roster: tap to reveal
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button
          type="button"
          variant="primary"
          onClick={handleSave}
          loading={saving}
          disabled={!dirty}
          className="min-h-[44px]"
        >
          Save medical privacy
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleReset}
          disabled={
            equals(draft, DEFAULT_MEDICAL_VISIBILITY) && !dirty
          }
          className="min-h-[44px]"
        >
          Reset to defaults
        </Button>
        {savedAt && !dirty && (
          <span className="text-xs text-vc-sage">
            Saved {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
    </section>
  );
}
