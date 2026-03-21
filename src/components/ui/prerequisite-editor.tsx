"use client";

import type { OnboardingStep, OnboardingStepType } from "@/lib/types";

const PRESETS: { type: OnboardingStepType; label: string; threshold?: number }[] = [
  { type: "class", label: "Attend orientation class" },
  { type: "shadow", label: "Shadow a team member (1 service)" },
  { type: "background_check", label: "Complete background check" },
  { type: "minimum_service", label: "Serve 3 times in entry-level role", threshold: 3 },
];

interface PrerequisiteEditorProps {
  prerequisites: OnboardingStep[];
  onChange: (updated: OnboardingStep[]) => void;
  label?: string;
}

export function PrerequisiteEditor({
  prerequisites,
  onChange,
  label = "Onboarding Prerequisites",
}: PrerequisiteEditorProps) {
  function addPrereq() {
    onChange([
      ...prerequisites,
      { id: crypto.randomUUID(), label: "", type: "class" as OnboardingStepType },
    ]);
  }

  function updatePrereq(idx: number, patch: Partial<OnboardingStep>) {
    onChange(
      prerequisites.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    );
  }

  function removePrereq(idx: number) {
    onChange(prerequisites.filter((_, i) => i !== idx));
  }

  const availablePresets = PRESETS.filter(
    (preset) => !prerequisites.some((p) => p.label === preset.label),
  );

  return (
    <div className="rounded-lg border border-vc-border-light bg-vc-bg-warm/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-vc-text">{label}</label>
        <button
          type="button"
          onClick={addPrereq}
          className="text-xs font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
        >
          + Add prerequisite
        </button>
      </div>
      {prerequisites.length === 0 && (
        <p className="text-xs text-vc-text-muted">
          No prerequisites — all volunteers can serve immediately.
        </p>
      )}
      {prerequisites.length < 5 && availablePresets.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-vc-text-muted">
            Quick Add
          </p>
          <div className="flex flex-wrap gap-1.5">
            {availablePresets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  onChange([
                    ...prerequisites,
                    {
                      id: crypto.randomUUID(),
                      label: preset.label,
                      type: preset.type,
                      ...(preset.threshold ? { threshold: preset.threshold } : {}),
                    },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-vc-border px-2.5 py-1.5 text-xs text-vc-text-muted hover:border-vc-coral hover:text-vc-coral transition-colors min-h-[44px]"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {prerequisites.map((prereq, idx) => (
        <div key={prereq.id} className="flex items-center gap-2">
          <select
            className="w-36 rounded-lg border border-vc-border bg-white px-2 py-1.5 text-xs text-vc-text focus:border-vc-coral focus:outline-none"
            value={prereq.type}
            onChange={(e) =>
              updatePrereq(idx, { type: e.target.value as OnboardingStepType })
            }
          >
            <option value="class">Class / Training</option>
            <option value="background_check">Background Check</option>
            <option value="minimum_service">Min. Service Count</option>
            <option value="ministry_tenure">Ministry Tenure</option>
            <option value="shadow">Shadow / Observe</option>
            <option value="custom">Custom</option>
          </select>
          <input
            className="min-w-0 flex-1 rounded-lg border border-vc-border bg-white px-2 py-1.5 text-xs text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none"
            placeholder="Requirement label (e.g., Complete Get Anchored class)"
            value={prereq.label}
            onChange={(e) => updatePrereq(idx, { label: e.target.value })}
          />
          {(prereq.type === "minimum_service" || prereq.type === "ministry_tenure") && (
            <input
              type="number"
              min={1}
              className="w-16 rounded-lg border border-vc-border bg-white px-2 py-1.5 text-xs text-vc-text focus:border-vc-coral focus:outline-none"
              placeholder={prereq.type === "minimum_service" ? "Count" : "Days"}
              value={prereq.threshold || ""}
              onChange={(e) =>
                updatePrereq(idx, { threshold: Number(e.target.value) || null })
              }
            />
          )}
          <button
            type="button"
            onClick={() => removePrereq(idx)}
            className="p-1 text-vc-text-muted hover:text-vc-danger transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
