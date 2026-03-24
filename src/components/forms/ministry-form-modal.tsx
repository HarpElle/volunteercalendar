"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PrerequisiteEditor } from "@/components/ui/prerequisite-editor";
import Link from "next/link";
import type { OnboardingStep } from "@/lib/types";
import {
  CHURCH_MINISTRY_TEMPLATES,
  MINISTRY_CATEGORY_LABELS,
} from "@/lib/constants";

const PRESET_COLORS = [
  { hex: "#E07A5F", name: "Coral" },
  { hex: "#2D3047", name: "Indigo" },
  { hex: "#81B29A", name: "Sage" },
  { hex: "#F2CC8F", name: "Sand" },
  { hex: "#7B68EE", name: "Purple" },
  { hex: "#E84855", name: "Red" },
  { hex: "#3D8BF2", name: "Blue" },
  { hex: "#F29E4C", name: "Orange" },
];

export interface MinistryFormData {
  name: string;
  color: string;
  description: string;
  requiresBgCheck: boolean;
  prereqs: OnboardingStep[];
}

interface MinistryFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: MinistryFormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  saving: boolean;
  deleting: boolean;
  initialValues?: MinistryFormData;
  isEditing: boolean;
  /** Organization terminology — e.g. { singular: "Ministry", singularLower: "ministry", plural: "Ministries" } */
  terms: { singular: string; singularLower: string; plural: string };
  /** Show template picker before the blank form (only for new items) */
  showTemplatePicker?: boolean;
  /** Names of existing ministries — templates with matching names are hidden */
  existingMinistryNames?: string[];
}

export function MinistryFormModal({
  open,
  onClose,
  onSubmit,
  onDelete,
  saving,
  deleting,
  initialValues,
  isEditing,
  terms,
  showTemplatePicker,
  existingMinistryNames,
}: MinistryFormModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0].hex);
  const [description, setDescription] = useState("");
  const [requiresBgCheck, setRequiresBgCheck] = useState(false);
  const [prereqs, setPrereqs] = useState<OnboardingStep[]>([]);
  const [pickerMode, setPickerMode] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? "");
      setColor(initialValues?.color ?? PRESET_COLORS[0].hex);
      setDescription(initialValues?.description ?? "");
      setRequiresBgCheck(initialValues?.requiresBgCheck ?? false);
      setPrereqs(initialValues?.prereqs ?? []);
      // Show picker for new items when templates are enabled
      setPickerMode(!isEditing && !!showTemplatePicker);
    }
  }, [open, initialValues, isEditing, showTemplatePicker]);

  function selectTemplate(template: (typeof CHURCH_MINISTRY_TEMPLATES)[number]) {
    setName(template.name);
    setColor(template.color);
    setDescription(template.description);
    setRequiresBgCheck(template.requires_background_check);
    setPrereqs([]);
    setPickerMode(false);
  }

  function resetAndShowPicker() {
    setName("");
    setColor(PRESET_COLORS[0].hex);
    setDescription("");
    setRequiresBgCheck(false);
    setPrereqs([]);
    setPickerMode(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit({ name, color, description, requiresBgCheck, prereqs });
  }

  // Filter out templates that already exist
  const existingNames = new Set(
    (existingMinistryNames || []).map((n) => n.toLowerCase()),
  );

  const categories = Object.keys(MINISTRY_CATEGORY_LABELS);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        pickerMode
          ? "Choose a Template"
          : isEditing
            ? "Edit " + terms.singular
            : "New " + terms.singular
      }
    >
      {pickerMode ? (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-vc-text-secondary">
              Pick a template or start from scratch
            </p>
            <button
              type="button"
              onClick={() => setPickerMode(false)}
              className="text-sm font-medium text-vc-coral hover:text-vc-coral-dark"
            >
              Start from scratch
            </button>
          </div>

          <div className="max-h-[400px] space-y-5 overflow-y-auto pr-1">
            {categories.map((cat) => {
              const templates = CHURCH_MINISTRY_TEMPLATES.filter(
                (t) =>
                  t.category === cat &&
                  !existingNames.has(t.name.toLowerCase()),
              );
              if (templates.length === 0) return null;

              return (
                <div key={cat}>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-vc-text-muted">
                    {MINISTRY_CATEGORY_LABELS[cat]}
                  </h3>
                  <div className="space-y-1.5">
                    {templates.map((template) => (
                      <button
                        key={template.name}
                        type="button"
                        onClick={() => selectTemplate(template)}
                        className="flex w-full items-start gap-3 rounded-lg border border-vc-border-light bg-white p-3 text-left transition-all hover:border-vc-coral/40 hover:bg-vc-coral/5"
                      >
                        <span
                          className="mt-1 h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: template.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-vc-indigo">
                            {template.name}
                          </p>
                          <p className="mt-0.5 text-xs text-vc-text-muted">
                            {template.description}
                          </p>
                        </div>
                        {template.requires_background_check && (
                          <span className="mt-0.5 shrink-0 rounded-full bg-vc-sand/40 px-2 py-0.5 text-[10px] font-medium text-vc-text-muted">
                            BG check
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {showTemplatePicker && !isEditing && (
            <button
              type="button"
              onClick={resetAndShowPicker}
              className="mb-2 flex items-center gap-1 text-sm text-vc-coral hover:text-vc-coral-dark"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Browse templates
            </button>
          )}

          <Input
            label={terms.singular + " Name"}
            required
            placeholder="e.g., Worship, Kids, Tech"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Description"
            placeholder={"Brief description of this " + terms.singularLower}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-vc-text">Color</label>
            <div className="flex flex-wrap gap-3">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setColor(c.hex)}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-all ${
                    color === c.hex
                      ? "ring-2 ring-offset-2 ring-vc-indigo bg-vc-bg-warm font-medium"
                      : "hover:bg-vc-bg-warm/50"
                  }`}
                >
                  <span
                    className="h-5 w-5 shrink-0 rounded-full"
                    style={{ backgroundColor: c.hex }}
                  />
                  <span className="text-vc-text-secondary">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={requiresBgCheck}
              onChange={(e) => setRequiresBgCheck(e.target.checked)}
              className="h-4 w-4 rounded border-vc-border text-vc-coral focus:ring-vc-coral"
            />
            <span className="text-sm text-vc-text-secondary">
              Require background check clearance to serve in this {terms.singularLower}
            </span>
          </label>

          <PrerequisiteEditor
            prerequisites={prereqs}
            onChange={setPrereqs}
          />
          <p className="text-xs text-vc-text-muted">
            You can also manage prerequisites and track volunteer progress from the{" "}
            <Link href="/dashboard/onboarding" className="font-medium text-vc-coral hover:text-vc-coral-dark transition-colors">
              Onboarding
            </Link>{" "}
            page.
          </p>

          <div className="flex items-center gap-3">
            <Button type="submit" loading={saving}>
              {isEditing ? "Save Changes" : "Create " + terms.singular}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            {isEditing && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="ml-auto text-sm font-medium text-vc-text-muted hover:text-vc-danger transition-colors"
              >
                {deleting ? "Deleting..." : "Delete " + terms.singular}
              </button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
