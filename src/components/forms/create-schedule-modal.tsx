"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WORKFLOW_MODES } from "@/lib/constants";
import type { WorkflowMode } from "@/lib/types";

export interface CreateScheduleOptions {
  startDate: string;
  endDate: string;
  workflowMode: WorkflowMode;
  availabilityDueDate: string | null;
  availabilityMessage: string | null;
}

interface CreateScheduleModalProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (options: CreateScheduleOptions) => Promise<void>;
  generating: boolean;
  serviceCount: number;
  volunteerCount: number;
}

function defaultStartDate() {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()));
  return d.toISOString().split("T")[0];
}

function defaultEndDate() {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()) + 27);
  return d.toISOString().split("T")[0];
}

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  return d.toISOString().split("T")[0];
}

const STEPS = ["Workflow", "Coverage Period", "Review"] as const;

export function CreateScheduleModal({
  open,
  onClose,
  onGenerate,
  generating,
  serviceCount,
  volunteerCount,
}: CreateScheduleModalProps) {
  const [step, setStep] = useState(0);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("centralized");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [collectAvailability, setCollectAvailability] = useState(false);
  const [availabilityDueDate, setAvailabilityDueDate] = useState(defaultDueDate);
  const [availabilityMessage, setAvailabilityMessage] = useState("");

  useEffect(() => {
    if (open) {
      setStep(0);
      setWorkflowMode("centralized");
      setStartDate(defaultStartDate());
      setEndDate(defaultEndDate());
      setCollectAvailability(false);
      setAvailabilityDueDate(defaultDueDate());
      setAvailabilityMessage("");
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onGenerate({
      startDate,
      endDate,
      workflowMode,
      availabilityDueDate: collectAvailability ? availabilityDueDate : null,
      availabilityMessage: collectAvailability && availabilityMessage ? availabilityMessage : null,
    });
  }

  function canAdvance(): boolean {
    if (step === 1) {
      if (!startDate || !endDate) return false;
      if (collectAvailability && !availabilityDueDate) return false;
    }
    return true;
  }

  return (
    <Modal open={open} onClose={onClose} title="New Schedule" maxWidth="max-w-2xl">
      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-1">
            <div className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`h-1.5 w-full rounded-full transition-colors ${
                  i <= step ? "bg-vc-coral" : "bg-vc-border"
                }`}
              />
              <span
                className={`text-[10px] font-medium transition-colors ${
                  i <= step ? "text-vc-coral" : "text-vc-text-muted"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Step 1: Workflow Mode */}
        {step === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-vc-text-secondary">
              How should scheduling work for this period?
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {WORKFLOW_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setWorkflowMode(mode.value)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    workflowMode === mode.value
                      ? "border-vc-coral bg-vc-coral/5 ring-1 ring-vc-coral/20"
                      : "border-vc-border-light bg-white hover:border-vc-coral/40"
                  }`}
                >
                  <span className="text-sm font-semibold text-vc-indigo">{mode.label}</span>
                  <p className="mt-1 text-xs text-vc-text-muted leading-relaxed">
                    {mode.description}
                  </p>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button type="button" onClick={() => setStep(1)}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Coverage Period + Availability */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Start Date"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <Input
                label="End Date"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm/50 p-4">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={collectAvailability}
                  onChange={(e) => setCollectAvailability(e.target.checked)}
                  className="h-4 w-4 rounded border-vc-border text-vc-coral focus:ring-vc-coral/30"
                />
                <div>
                  <span className="text-sm font-medium text-vc-text">
                    Collect volunteer availability first
                  </span>
                  <p className="text-xs text-vc-text-muted">
                    Send an availability request to all volunteers before generating the schedule.
                  </p>
                </div>
              </label>

              {collectAvailability && (
                <div className="mt-3 space-y-3 pl-6">
                  <Input
                    label="Availability Due Date"
                    type="date"
                    required
                    value={availabilityDueDate}
                    onChange={(e) => setAvailabilityDueDate(e.target.value)}
                  />
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-vc-text">
                      Message to volunteers (optional)
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-1 focus:ring-vc-coral/30 transition-colors min-h-[60px] resize-y"
                      placeholder="e.g., Please submit your availability for the upcoming month..."
                      value={availabilityMessage}
                      onChange={(e) => setAvailabilityMessage(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button type="button" variant="ghost" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button type="button" onClick={() => setStep(2)} disabled={!canAdvance()}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-vc-border-light bg-white p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-vc-text-muted">Workflow</span>
                <span className="font-medium text-vc-indigo">
                  {WORKFLOW_MODES.find((m) => m.value === workflowMode)?.label}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-vc-text-muted">Coverage Period</span>
                <span className="font-medium text-vc-indigo">
                  {startDate} to {endDate}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-vc-text-muted">Services</span>
                <span className="font-medium text-vc-indigo">{serviceCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-vc-text-muted">Volunteers</span>
                <span className="font-medium text-vc-indigo">{volunteerCount}</span>
              </div>
              {collectAvailability && (
                <div className="flex justify-between text-sm">
                  <span className="text-vc-text-muted">Availability Due</span>
                  <span className="font-medium text-vc-coral">{availabilityDueDate}</span>
                </div>
              )}
            </div>

            {collectAvailability && (
              <div className="rounded-lg bg-vc-sand/20 px-4 py-3 text-sm text-vc-text-secondary">
                An availability request will be sent to all active volunteers after the draft is created.
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="submit" loading={generating}>
                {generating ? "Generating..." : "Generate Draft"}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
