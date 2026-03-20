"use client";

import { Suspense, useState, useEffect, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { getAuth } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WORKFLOW_MODES } from "@/lib/constants";
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

  const selectedWorkflow = WORKFLOW_MODES.find((m) => m.value === workflowMode);

  // Redirect if user already has an org set up — unless they're creating an additional org
  useEffect(() => {
    if (profile?.church_id && !isNewOrgMode) {
      router.replace("/dashboard");
    }
  }, [profile, router, isNewOrgMode]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError("");

    try {
      const idToken = await getAuth().currentUser?.getIdToken();
      if (!idToken) throw new Error("Not authenticated");

      const res = await fetch("/api/organization", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          org_type: orgType,
          timezone,
          workflow_mode: workflowMode,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to create organization (${res.status})`);
      }

      const { church_id: churchId } = await res.json();

      // Fire-and-forget: send org-created confirmation email
      fetch("/api/notify/org-created", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ church_id: churchId }),
      }).catch(() => {});

      // Full page reload so onAuthStateChanged re-fires with updated profile
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("Setup failed:", err);
      setError((err as Error).message || "Failed to create organization. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Set up your organization</h1>
        <p className="mt-1 text-vc-text-secondary">
          Tell us about your organization so we can configure scheduling for you.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-vc-text">Organization Type</label>
          <div className="grid grid-cols-3 gap-3">
            {([
              { value: "church" as const, label: "Church" },
              { value: "nonprofit" as const, label: "Nonprofit" },
              { value: "other" as const, label: "Other" },
            ]).map((opt) => (
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

        <Input
          label={orgType === "church" ? "Church Name" : "Organization Name"}
          required
          placeholder={orgType === "church" ? "Anchor Falls Church" : "Helping Hands Nonprofit"}
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
                        : "border-vc-border-light opacity-60 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-vc-indigo">{mode.label}</p>
                    {!isAvailable && (
                      <span className="rounded-full bg-vc-bg-cream px-2 py-0.5 text-[10px] font-medium text-vc-text-muted">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-vc-text-muted leading-relaxed">{mode.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
            {error}
          </div>
        )}

        <Button type="submit" loading={loading} size="lg" className="w-full">
          {orgType === "church" ? "Create Church" : "Create Organization"}
        </Button>
      </form>
    </div>
  );
}
