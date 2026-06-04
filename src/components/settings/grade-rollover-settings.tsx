"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { updateDocument } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import type { ChurchSettings } from "@/lib/types";

interface Props {
  churchId: string;
}

type RolloverPolicy = NonNullable<ChurchSettings["grade_rollover"]>;

const OPTIONS: Array<{ value: RolloverPolicy; label: string; description: string }> = [
  {
    value: "manual",
    label: "Manual — no auto-advance",
    description:
      "Staff updates grades by hand. Parents can still edit their child's grade via the Family Portal at any time.",
  },
  {
    value: "june",
    label: "June 1 (end of school year)",
    description:
      "Bulk-advances every active child by one grade on June 1. 6th graders are archived as graduated.",
  },
  {
    value: "august",
    label: "August 1 (start of school year)",
    description:
      "Bulk-advances every active child by one grade on August 1. Most common for churches that follow the US school calendar.",
  },
  {
    value: "september",
    label: "September 1 (after Labor Day)",
    description:
      "Bulk-advances every active child by one grade on September 1. Use this if your school year starts after Labor Day.",
  },
];

export function GradeRolloverSettings({ churchId }: Props) {
  const [policy, setPolicy] = useState<RolloverPolicy>("manual");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, "churches", churchId));
        if (snap.exists()) {
          const settings = (snap.data().settings ?? {}) as ChurchSettings;
          setPolicy(settings.grade_rollover ?? "manual");
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [churchId]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const snap = await getDoc(doc(db, "churches", churchId));
      const existing = snap.exists() ? (snap.data().settings ?? {}) : {};
      const updatedSettings = {
        ...existing,
        grade_rollover: policy,
      };
      await updateDocument("churches", churchId, { settings: updatedSettings });
      setSuccess("Grade rollover policy saved.");
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-vc-indigo">
        Annual grade rollover
      </h2>
      <p className="mb-4 text-sm text-vc-text-secondary">
        Bulk-advance every active child by one grade each year. Children
        whose grade was updated within the last 60 days are skipped so
        recent staff or parent edits aren&apos;t overwritten. 6th-graders
        are archived as graduated (recoverable from the People tab).
      </p>
      <div className="rounded-xl border border-vc-border-light bg-white p-6 space-y-4">
        <div className="space-y-3">
          {OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-start gap-3 cursor-pointer"
            >
              <input
                type="radio"
                name="grade-rollover-policy"
                value={opt.value}
                checked={policy === opt.value}
                onChange={() => setPolicy(opt.value)}
                className="mt-1 h-4 w-4 text-vc-coral focus:ring-vc-coral"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium text-vc-indigo">
                  {opt.label}
                </span>
                <span className="block text-xs text-vc-text-muted mt-0.5">
                  {opt.description}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3 pt-2 border-t border-vc-border-light">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Saving…" : "Save"}
          </Button>
          {success && (
            <p className="text-sm text-vc-sage font-medium">{success}</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </section>
  );
}
