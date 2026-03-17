"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { setDocument, updateDocument } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WORKFLOW_MODES } from "@/lib/constants";
import type { Church, ChurchSettings, WorkflowMode } from "@/lib/types";

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
];

export default function ChurchSetupPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("centralized");

  const selectedWorkflow = WORKFLOW_MODES.find((m) => m.value === workflowMode);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError("");

    try {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const settings: ChurchSettings = {
        default_schedule_range_weeks: 4,
        default_reminder_channels: ["email"],
        require_confirmation: true,
      };

      const churchData: Omit<Church, "id"> = {
        name,
        slug,
        workflow_mode: workflowMode,
        timezone,
        subscription_tier: "free",
        stripe_customer_id: null,
        settings,
        created_at: new Date().toISOString(),
      };

      // Use the user's UID as the church ID for simple 1:1 mapping during MVP
      const churchId = user.uid;
      await setDocument("churches", churchId, churchData);

      // Link user profile to their church
      await updateDocument("users", user.uid, {
        church_id: churchId,
        role: "admin",
      });

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "Failed to create church. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Set up your church</h1>
        <p className="mt-1 text-vc-text-secondary">
          Tell us about your organization so we can configure scheduling for you.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label="Church Name"
          required
          placeholder="Anchor Falls Church"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <Select
          label="Timezone"
          options={TIMEZONE_OPTIONS}
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />

        <div className="space-y-3">
          <label className="text-sm font-medium text-vc-text">Scheduling Workflow</label>
          <div className="grid gap-3 sm:grid-cols-2">
            {WORKFLOW_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setWorkflowMode(mode.value)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  workflowMode === mode.value
                    ? "border-vc-coral bg-vc-coral/5 ring-1 ring-vc-coral"
                    : "border-vc-border hover:border-vc-indigo/20 hover:bg-vc-bg-warm"
                }`}
              >
                <p className="text-sm font-semibold text-vc-indigo">{mode.label}</p>
                <p className="mt-1 text-xs text-vc-text-muted leading-relaxed">{mode.description}</p>
              </button>
            ))}
          </div>
          {selectedWorkflow && workflowMode !== "centralized" && (
            <p className="rounded-lg bg-vc-sand/20 px-3 py-2 text-xs text-vc-text-secondary">
              The MVP focuses on Centralized mode. Other modes will unlock as we build them out —
              your choice is saved and will apply when ready.
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
            {error}
          </div>
        )}

        <Button type="submit" loading={loading} size="lg" className="w-full">
          Create Church
        </Button>
      </form>
    </div>
  );
}
