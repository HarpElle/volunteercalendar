"use client";

import { useState } from "react";
import {
  addChurchDocument,
  updateChurchDocument,
  removeChurchDocument,
} from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import type { Campus } from "@/lib/types";
import {
  CampusFormModal,
  type CampusFormData,
} from "@/components/forms/campus-form-modal";

interface CampusesSettingsProps {
  churchId: string;
  campuses: Campus[];
  setCampuses: React.Dispatch<React.SetStateAction<Campus[]>>;
  mutationError: string;
  setMutationError: (error: string) => void;
}

export function CampusesSettings({
  churchId,
  campuses,
  setCampuses,
  mutationError,
  setMutationError,
}: CampusesSettingsProps) {
  const [showCampusForm, setShowCampusForm] = useState(false);
  const [editingCampusId, setEditingCampusId] = useState<string | null>(null);
  const [campusSaving, setCampusSaving] = useState(false);

  function closeCampusForm() {
    setEditingCampusId(null);
    setShowCampusForm(false);
  }

  function startEditCampus(c: Campus) {
    setEditingCampusId(c.id);
    setShowCampusForm(true);
  }

  async function handleCampusSubmit(formData: CampusFormData) {
    setCampusSaving(true);
    try {
      const data = {
        name: formData.name,
        address: formData.address || null,
        location: formData.location,
        timezone: null,
        is_primary: formData.isPrimary,
        church_id: churchId,
        ...(editingCampusId ? {} : { created_at: new Date().toISOString() }),
      };
      // If setting as primary, unset other primaries
      if (formData.isPrimary) {
        for (const existing of campuses) {
          if (existing.is_primary && existing.id !== editingCampusId) {
            await updateChurchDocument(churchId, "campuses", existing.id, {
              is_primary: false,
            });
          }
        }
      }
      if (editingCampusId) {
        await updateChurchDocument(
          churchId,
          "campuses",
          editingCampusId,
          data
        );
        setCampuses((prev) =>
          prev.map((c) => {
            if (c.id === editingCampusId) return { ...c, ...data };
            if (formData.isPrimary && c.is_primary)
              return { ...c, is_primary: false };
            return c;
          })
        );
      } else {
        const ref = await addChurchDocument(churchId, "campuses", data);
        setCampuses((prev) => {
          const updated = formData.isPrimary
            ? prev.map((c) =>
                c.is_primary ? { ...c, is_primary: false } : c
              )
            : prev;
          return [...updated, { id: ref.id, ...data } as Campus];
        });
      }
      closeCampusForm();
    } catch {
      setMutationError("Failed to save campus.");
    } finally {
      setCampusSaving(false);
    }
  }

  async function handleDeleteCampus(id: string) {
    if (!window.confirm("Delete this campus? This cannot be undone.")) return;
    try {
      await removeChurchDocument(churchId, "campuses", id);
      setCampuses((prev) => prev.filter((c) => c.id !== id));
      closeCampusForm();
    } catch (err) {
      console.error("Delete campus failed:", err);
      setMutationError("Failed to delete campus.");
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-vc-indigo">Campuses</h2>
            <p className="text-sm text-vc-text-muted">
              Manage multiple sites or locations within your organization.
            </p>
          </div>
          <Button size="sm" onClick={() => setShowCampusForm(true)}>
            Add Campus
          </Button>
        </div>

        <CampusFormModal
          open={showCampusForm}
          onClose={closeCampusForm}
          onSubmit={handleCampusSubmit}
          onDelete={
            editingCampusId
              ? () => handleDeleteCampus(editingCampusId)
              : undefined
          }
          saving={campusSaving}
          isEditing={!!editingCampusId}
          initialValues={(() => {
            const c = editingCampusId
              ? campuses.find((x) => x.id === editingCampusId)
              : null;
            return c
              ? {
                  name: c.name,
                  address: c.address || "",
                  location: c.location || null,
                  isPrimary: c.is_primary,
                }
              : undefined;
          })()}
        />

        {campuses.length === 0 && !showCampusForm ? (
          <div className="rounded-xl border border-dashed border-vc-border bg-white p-8 text-center">
            <p className="text-vc-text-secondary">No campuses configured.</p>
            <p className="mt-1 text-sm text-vc-text-muted">
              Single-site organizations don&apos;t need campuses. Add one if you
              have multiple locations.
            </p>
          </div>
        ) : campuses.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campuses.map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => startEditCampus(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    startEditCampus(c);
                  }
                }}
                className="relative rounded-xl border border-vc-border-light bg-white p-5 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-vc-indigo/10 text-sm font-semibold text-vc-indigo">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-vc-indigo">{c.name}</h3>
                    {c.address && (
                      <p className="mt-0.5 text-sm text-vc-text-muted">
                        {c.address}
                      </p>
                    )}
                    {c.is_primary && (
                      <span className="mt-1.5 inline-flex items-center rounded-full bg-vc-coral/10 px-2 py-0.5 text-[10px] font-medium text-vc-coral">
                        Primary
                      </span>
                    )}
                  </div>
                  {/* Chevron affordance */}
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0 text-vc-text-muted"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m8.25 4.5 7.5 7.5-7.5 7.5"
                    />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
