"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PrerequisiteEditor } from "@/components/ui/prerequisite-editor";
import Link from "next/link";
import type { OnboardingStep } from "@/lib/types";

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
}: MinistryFormModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0].hex);
  const [description, setDescription] = useState("");
  const [requiresBgCheck, setRequiresBgCheck] = useState(false);
  const [prereqs, setPrereqs] = useState<OnboardingStep[]>([]);

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? "");
      setColor(initialValues?.color ?? PRESET_COLORS[0].hex);
      setDescription(initialValues?.description ?? "");
      setRequiresBgCheck(initialValues?.requiresBgCheck ?? false);
      setPrereqs(initialValues?.prereqs ?? []);
    }
  }, [open, initialValues]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit({ name, color, description, requiresBgCheck, prereqs });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit " + terms.singular : "New " + terms.singular}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
    </Modal>
  );
}
