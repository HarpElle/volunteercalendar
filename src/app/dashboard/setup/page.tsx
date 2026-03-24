"use client";

import { Suspense, useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { addChurchDocument } from "@/lib/firebase/firestore";
import { getAuth } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  WORKFLOW_MODES,
  CHURCH_MINISTRY_TEMPLATES,
  MINISTRY_CATEGORY_LABELS,
  TIER_LIMITS,
} from "@/lib/constants";
import type { WorkflowMode, OrgType } from "@/lib/types";

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
];

export default function ChurchSetupPage() {
  return (
    <Suspense>
      <SetupContent />
    </Suspense>
  );
}

function SetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNewOrgMode = searchParams.get("mode") === "new";
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("church");
  const [timezone, setTimezone] = useState("America/New_York");
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("centralized");

  // Stepped wizard
  const [step, setStep] = useState(1);
  const totalSteps = orgType === "church" ? 4 : 3;

  // Ministry template selection (step 4 for churches)
  const [selectedTemplates, setSelectedTemplates] = useState<Set<number>>(
    new Set(),
  );
  const [templateNames, setTemplateNames] = useState<Map<number, string>>(
    new Map(),
  );

  // New orgs always start on the free tier
  const FREE_MINISTRY_LIMIT = TIER_LIMITS.free.ministries;

  const selectedWorkflow = WORKFLOW_MODES.find((m) => m.value === workflowMode);

  // Redirect if user already has an org set up — unless they're creating an additional org
  useEffect(() => {
    if (profile?.church_id && !isNewOrgMode) {
      router.replace("/dashboard");
    }
  }, [profile, router, isNewOrgMode]);

  // Reset ministry step if user changes org type away from church
  useEffect(() => {
    if (orgType !== "church" && step > 3) {
      setStep(3);
    }
  }, [orgType, step]);

  function canAdvance(): boolean {
    switch (step) {
      case 1:
        return true; // org type always has a default
      case 2:
        return name.trim().length > 0;
      case 3:
        return true; // workflow always has a default
      case 4:
        return true; // ministry selection is optional
      default:
        return false;
    }
  }

  function handleNext() {
    if (canAdvance() && step < totalSteps) {
      setStep(step + 1);
    }
  }

  function handleBack() {
    if (step > 1) {
      setStep(step - 1);
    }
  }

  function toggleTemplate(index: number) {
    setSelectedTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else if (next.size < FREE_MINISTRY_LIMIT) {
        next.add(index);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selectedTemplates.size > 0) {
      setSelectedTemplates(new Set());
    } else {
      setSelectedTemplates(
        new Set(CHURCH_MINISTRY_TEMPLATES.slice(0, FREE_MINISTRY_LIMIT).map((_, i) => i)),
      );
    }
  }

  function renameTemplate(index: number, newName: string) {
    setTemplateNames((prev) => {
      const next = new Map(prev);
      if (newName.trim() === "" || newName === CHURCH_MINISTRY_TEMPLATES[index].name) {
        next.delete(index);
      } else {
        next.set(index, newName);
      }
      return next;
    });
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!user) return;
    setLoading(true);
    setError("");

    try {
      const idToken = await getAuth().currentUser?.getIdToken();
      if (!idToken) throw new Error("Not authenticated");

      const res = await fetch("/api/organization", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          org_type: orgType,
          timezone,
          workflow_mode: workflowMode,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || `Failed to create organization (${res.status})`,
        );
      }

      const { church_id: churchId } = await res.json();

      // Fire-and-forget: send org-created confirmation email
      fetch("/api/notify/org-created", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ church_id: churchId }),
      }).catch(() => {});

      // Create selected ministry templates (capped to Free tier limit)
      if (orgType === "church" && selectedTemplates.size > 0) {
        const templateArray = Array.from(selectedTemplates).slice(0, FREE_MINISTRY_LIMIT);
        await Promise.all(
          templateArray.map(async (idx) => {
            const template = CHURCH_MINISTRY_TEMPLATES[idx];
            const customName = templateNames.get(idx);
            await addChurchDocument(churchId, "ministries", {
              name: customName || template.name,
              color: template.color,
              description: template.description,
              requires_background_check: template.requires_background_check,
              prerequisites: [],
              church_id: churchId,
              lead_user_id: user.uid,
              lead_email: user.email || "",
              created_at: new Date().toISOString(),
            });
          }),
        );
      }

      // Full page reload so onAuthStateChanged re-fires with updated profile
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("Setup failed:", err);
      setError(
        (err as Error).message ||
          "Failed to create organization. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  const isLastStep = step === totalSteps;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">
          Set up your organization
        </h1>
        <p className="mt-1 text-vc-text-secondary">
          {step === 4 && orgType === "church"
            ? "Choose ministries to get started quickly."
            : "Tell us about your organization so we can configure scheduling for you."}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-8 flex items-center gap-2">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full transition-colors ${
              i < step ? "bg-vc-coral" : "bg-vc-border"
            }`}
          />
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isLastStep) {
            handleSubmit();
          } else {
            handleNext();
          }
        }}
        className="space-y-6"
      >
        {/* Step 1: Organization Type */}
        {step === 1 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-vc-text">
              Organization Type
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { value: "church" as const, label: "Church" },
                  { value: "nonprofit" as const, label: "Nonprofit" },
                  { value: "other" as const, label: "Other" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOrgType(opt.value)}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                    orgType === opt.value
                      ? "border-vc-coral bg-vc-coral/5 text-vc-indigo ring-1 ring-vc-coral"
                      : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20 hover:bg-vc-bg-warm"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Name + Timezone */}
        {step === 2 && (
          <>
            <Input
              label={
                orgType === "church" ? "Church Name" : "Organization Name"
              }
              required
              placeholder={
                orgType === "church"
                  ? "Anchor Falls Church"
                  : "Helping Hands Nonprofit"
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Select
              label="Timezone"
              options={TIMEZONE_OPTIONS}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </>
        )}

        {/* Step 3: Scheduling Workflow */}
        {step === 3 && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-vc-text">
              Scheduling Workflow
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {WORKFLOW_MODES.map((mode) => {
                const isAvailable = mode.value === "centralized";
                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => isAvailable && setWorkflowMode(mode.value)}
                    disabled={!isAvailable}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      workflowMode === mode.value
                        ? "border-vc-coral bg-vc-coral/5 ring-1 ring-vc-coral"
                        : isAvailable
                          ? "border-vc-border hover:border-vc-indigo/20 hover:bg-vc-bg-warm"
                          : "border-vc-border-light cursor-not-allowed opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-vc-indigo">
                        {mode.label}
                      </p>
                      {!isAvailable && (
                        <span className="rounded-full bg-vc-bg-cream px-2 py-0.5 text-[10px] font-medium text-vc-text-muted">
                          Coming soon
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-vc-text-muted">
                      {mode.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Ministry Templates (church only) */}
        {step === 4 && orgType === "church" && (
          <MinistryTemplateStep
            selectedTemplates={selectedTemplates}
            templateNames={templateNames}
            onToggle={toggleTemplate}
            onToggleAll={toggleAll}
            onRename={renameTemplate}
            maxSelections={FREE_MINISTRY_LIMIT}
          />
        )}

        {error && (
          <div className="rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center gap-3">
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleBack}
            >
              Back
            </Button>
          )}

          <div className="flex-1" />

          {/* Skip link on ministry step */}
          {step === 4 && orgType === "church" && (
            <button
              type="button"
              onClick={() => {
                setSelectedTemplates(new Set());
                handleSubmit();
              }}
              className="text-sm text-vc-text-muted hover:text-vc-text-secondary"
              disabled={loading}
            >
              Skip
            </button>
          )}

          {isLastStep ? (
            <Button type="submit" loading={loading} size="lg">
              {orgType === "church"
                ? selectedTemplates.size > 0
                  ? `Create Church with ${selectedTemplates.size} ${selectedTemplates.size === 1 ? "Ministry" : "Ministries"}`
                  : "Create Church"
                : "Create Organization"}
            </Button>
          ) : (
            <Button
              type="submit"
              size="lg"
              disabled={!canAdvance()}
            >
              Next
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

// --- Ministry Template Step ---

function MinistryTemplateStep({
  selectedTemplates,
  templateNames,
  onToggle,
  onToggleAll,
  onRename,
  maxSelections,
}: {
  selectedTemplates: Set<number>;
  templateNames: Map<number, string>;
  onToggle: (index: number) => void;
  onToggleAll: () => void;
  onRename: (index: number, name: string) => void;
  maxSelections: number;
}) {
  const limitReached = selectedTemplates.size >= maxSelections;

  // Group templates by category
  const categories = Object.keys(MINISTRY_CATEGORY_LABELS);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        {selectedTemplates.size > 0 && (
          <button
            type="button"
            onClick={onToggleAll}
            className="text-sm font-medium text-vc-coral hover:text-vc-coral-dark"
          >
            Clear All
          </button>
        )}
        <span className="ml-auto text-sm text-vc-text-muted">
          {selectedTemplates.size} of {maxSelections} selected
        </span>
      </div>
      {limitReached && (
        <p className="mb-4 rounded-lg bg-vc-sand/30 px-3 py-2 text-xs text-vc-text-secondary">
          Free plan allows up to {maxSelections} teams. You can upgrade after setup for more.
        </p>
      )}

      <div className="space-y-6">
        {categories.map((cat) => {
          const templates = CHURCH_MINISTRY_TEMPLATES.map((t, i) => ({
            ...t,
            index: i,
          })).filter((t) => t.category === cat);
          if (templates.length === 0) return null;

          return (
            <div key={cat}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-vc-text-muted">
                {MINISTRY_CATEGORY_LABELS[cat]}
              </h3>
              <div className="space-y-2">
                {templates.map((template) => (
                  <TemplateCard
                    key={template.index}
                    index={template.index}
                    template={template}
                    selected={selectedTemplates.has(template.index)}
                    disabled={limitReached && !selectedTemplates.has(template.index)}
                    customName={templateNames.get(template.index)}
                    onToggle={() => onToggle(template.index)}
                    onRename={(n) => onRename(template.index, n)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TemplateCard({
  index,
  template,
  selected,
  disabled,
  customName,
  onToggle,
  onRename,
}: {
  index: number;
  template: { name: string; description: string; color: string; requires_background_check: boolean };
  selected: boolean;
  disabled?: boolean;
  customName: string | undefined;
  onToggle: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(customName || template.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commitEdit() {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== template.name) {
      onRename(trimmed);
    } else {
      onRename("");
      setEditValue(template.name);
    }
  }

  const displayName = customName || template.name;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 transition-all ${
        selected
          ? "border-vc-coral/40 bg-vc-coral/5"
          : disabled
            ? "border-vc-border-light bg-white opacity-50 cursor-not-allowed"
            : "border-vc-border-light bg-white"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-vc-border text-vc-coral accent-vc-coral disabled:cursor-not-allowed"
      />
      <div
        className="mt-1 h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: template.color }}
      />
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") {
                setEditValue(customName || template.name);
                setEditing(false);
              }
            }}
            className="w-full rounded border border-vc-coral/40 bg-white px-1.5 py-0.5 text-sm font-medium text-vc-indigo focus:outline-none focus:ring-1 focus:ring-vc-coral"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditValue(displayName);
              setEditing(true);
            }}
            className="group flex items-center gap-1.5 text-left"
          >
            <span className="text-sm font-medium text-vc-indigo">
              {displayName}
            </span>
            <svg
              className="h-3 w-3 text-vc-text-muted opacity-0 transition-opacity group-hover:opacity-100"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
              />
            </svg>
          </button>
        )}
        <p className="mt-0.5 text-xs text-vc-text-muted">
          {template.description}
        </p>
      </div>
      {template.requires_background_check && (
        <div className="mt-0.5 shrink-0" title="Background check required">
          <svg
            className="h-4 w-4 text-vc-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
