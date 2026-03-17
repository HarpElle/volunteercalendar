"use client";

import { useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { INTEGRATIONS } from "@/lib/integrations/config";
import { Button } from "@/components/ui/button";
import type { IntegrationProvider, IntegrationConfig } from "@/lib/integrations/types";

type Step = "select" | "connect" | "testing" | "connected" | "importing" | "done";

interface ImportStats {
  imported: number;
  skipped: number;
  teams_found: number;
  people_found: number;
  errors: string[];
}

export default function ImportPage() {
  const { user, activeMembership, profile } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [step, setStep] = useState<Step>("select");
  const [selectedProvider, setSelectedProvider] = useState<IntegrationConfig | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [error, setError] = useState("");

  async function getAuthHeaders(): Promise<Record<string, string>> {
    if (!user) return {};
    const token = await user.getIdToken();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  function selectProvider(config: IntegrationConfig) {
    setSelectedProvider(config);
    setCredentials({});
    setTestResult(null);
    setError("");
    setStep("connect");
  }

  function updateCredential(key: string, value: string) {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  }

  async function testConnection() {
    if (!selectedProvider || !churchId) return;
    setStep("testing");
    setError("");

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/import", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "test",
          provider: selectedProvider.provider,
          credentials,
          church_id: churchId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Connection test failed");
        setTestResult(false);
        setStep("connect");
        return;
      }

      setTestResult(data.connected);
      if (data.connected) {
        // Save credentials
        await fetch("/api/import", {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "save_creds",
            provider: selectedProvider.provider,
            credentials,
            church_id: churchId,
          }),
        });
        setStep("connected");
      } else {
        setError("Could not connect. Please check your credentials.");
        setStep("connect");
      }
    } catch {
      setError("Connection test failed. Please try again.");
      setStep("connect");
    }
  }

  async function runImport() {
    if (!selectedProvider || !churchId) return;
    setImporting(true);
    setError("");
    setStep("importing");

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/import", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "import",
          provider: selectedProvider.provider,
          credentials,
          church_id: churchId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed");
        setStep("connected");
        return;
      }

      setImportStats(data);
      setStep("done");
    } catch {
      setError("Import failed. Please try again.");
      setStep("connected");
    } finally {
      setImporting(false);
    }
  }

  function startOver() {
    setStep("select");
    setSelectedProvider(null);
    setCredentials({});
    setTestResult(null);
    setImportStats(null);
    setError("");
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-vc-indigo">Import Volunteers</h1>
        <p className="mt-1 text-vc-text-secondary">
          Connect your existing church management system to import volunteers and teams.
        </p>
      </div>

      {/* Step: Select Provider */}
      {step === "select" && (
        <div className="space-y-4">
          <p className="text-sm text-vc-text-muted">
            Select a platform to import from. Your existing volunteer data (CSV or manual) will not be affected.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {INTEGRATIONS.map((config) => (
              <button
                key={config.provider}
                onClick={() => selectProvider(config)}
                className="group rounded-xl border border-vc-border-light bg-white p-6 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.03] hover:border-vc-coral/40"
              >
                <ProviderIcon provider={config.provider} />
                <h3 className="mt-4 font-semibold text-vc-indigo">{config.label}</h3>
                <p className="mt-1 text-sm text-vc-text-secondary">{config.description}</p>
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-dashed border-vc-border bg-vc-bg-warm p-5">
            <p className="text-sm font-medium text-vc-indigo">Already have a spreadsheet?</p>
            <p className="mt-1 text-sm text-vc-text-secondary">
              You can also import volunteers via CSV on the{" "}
              <a href="/dashboard/volunteers" className="font-medium text-vc-coral hover:text-vc-coral-dark transition-colors">
                Volunteers page
              </a>.
            </p>
          </div>
        </div>
      )}

      {/* Step: Enter Credentials */}
      {(step === "connect" || step === "testing") && selectedProvider && (
        <div className="max-w-lg">
          <button
            onClick={startOver}
            className="mb-4 text-sm font-medium text-vc-text-secondary hover:text-vc-coral transition-colors"
          >
            &larr; Back to providers
          </button>

          <div className="rounded-xl border border-vc-border-light bg-white p-6">
            <div className="flex items-center gap-3 mb-4">
              <ProviderIcon provider={selectedProvider.provider} />
              <h2 className="text-lg font-semibold text-vc-indigo">
                Connect {selectedProvider.label}
              </h2>
            </div>

            <p className="mb-4 text-sm text-vc-text-secondary">
              Enter your API credentials to connect. These are stored securely and only used for importing.
            </p>

            <div className="space-y-3">
              {selectedProvider.authFields.map((field) => (
                <div key={field.key}>
                  <label className="mb-1.5 block text-sm font-medium text-vc-text">
                    {field.label}
                    {field.required && <span className="text-vc-coral ml-0.5">*</span>}
                  </label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    required={field.required}
                    value={credentials[field.key] || ""}
                    onChange={(e) => updateCredential(field.key, e.target.value)}
                    className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-base text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                  />
                </div>
              ))}
            </div>

            {error && (
              <div className="mt-3 rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
                {error}
              </div>
            )}

            <Button
              className="mt-4 w-full"
              onClick={testConnection}
              loading={step === "testing"}
              disabled={selectedProvider.authFields.some(
                (f) => f.required && !credentials[f.key]?.trim(),
              )}
            >
              Test Connection
            </Button>

            {selectedProvider.provider === "planning_center" && (
              <p className="mt-3 text-xs text-vc-text-muted">
                Create an Application ID and Secret at{" "}
                <span className="font-medium">api.planningcenteronline.com/oauth/applications</span>
                {" "}(Personal Access Token type).
              </p>
            )}
            {selectedProvider.provider === "breeze" && (
              <p className="mt-3 text-xs text-vc-text-muted">
                Find your API key under Extensions &gt; API in your Breeze admin panel.
              </p>
            )}
            {selectedProvider.provider === "rock_rms" && (
              <p className="mt-3 text-xs text-vc-text-muted">
                Create a REST API Key under Admin Tools &gt; Security &gt; REST Keys in Rock.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step: Connected — Ready to Import */}
      {step === "connected" && selectedProvider && (
        <div className="max-w-lg">
          <button
            onClick={startOver}
            className="mb-4 text-sm font-medium text-vc-text-secondary hover:text-vc-coral transition-colors"
          >
            &larr; Back to providers
          </button>

          <div className="rounded-xl border border-vc-sage/30 bg-white p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-vc-sage/15">
                <svg className="h-5 w-5 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-vc-indigo">
                  Connected to {selectedProvider.label}
                </h2>
                <p className="text-sm text-vc-sage">Connection verified</p>
              </div>
            </div>

            <p className="mb-4 text-sm text-vc-text-secondary">
              Ready to import. This will fetch people and teams from {selectedProvider.label} and
              add them as volunteers. Existing volunteers (matched by email) will be updated, not duplicated.
            </p>

            {error && (
              <div className="mb-3 rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
                {error}
              </div>
            )}

            <Button onClick={runImport} loading={importing} className="w-full">
              Import Volunteers
            </Button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === "importing" && (
        <div className="max-w-lg">
          <div className="rounded-xl border border-vc-border-light bg-white p-8 text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-vc-coral/20 border-t-vc-coral" />
            <h2 className="text-lg font-semibold text-vc-indigo">Importing...</h2>
            <p className="mt-1 text-sm text-vc-text-secondary">
              Fetching data from {selectedProvider?.label}. This may take a minute for large organizations.
            </p>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && importStats && (
        <div className="max-w-lg">
          <div className="rounded-xl border border-vc-sage/30 bg-white p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-vc-sage/15">
                <svg className="h-5 w-5 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-vc-indigo">Import Complete</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StatCard label="People found" value={importStats.people_found} />
              <StatCard label="Volunteers imported" value={importStats.imported} />
              <StatCard label="Teams found" value={importStats.teams_found} />
              <StatCard label="Skipped" value={importStats.skipped} />
            </div>

            {importStats.errors.length > 0 && (
              <div className="mt-4 rounded-lg bg-vc-sand/20 p-3">
                <p className="text-xs font-medium text-vc-text-secondary mb-1">Issues:</p>
                {importStats.errors.map((err, i) => (
                  <p key={i} className="text-xs text-vc-text-muted">{err}</p>
                ))}
              </div>
            )}

            <div className="mt-4 flex gap-3">
              <a href="/dashboard/volunteers">
                <Button>View Volunteers</Button>
              </a>
              <Button variant="ghost" onClick={startOver}>
                Import from another source
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-vc-bg-warm p-3 text-center">
      <p className="text-2xl font-semibold text-vc-indigo">{value}</p>
      <p className="text-xs text-vc-text-muted">{label}</p>
    </div>
  );
}

function ProviderIcon({ provider }: { provider: IntegrationProvider }) {
  const colors: Record<IntegrationProvider, string> = {
    planning_center: "bg-vc-indigo/10 text-vc-indigo",
    breeze: "bg-vc-coral/10 text-vc-coral",
    rock_rms: "bg-vc-sage/10 text-vc-sage",
  };

  return (
    <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${colors[provider]}`}>
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
      </svg>
    </div>
  );
}
