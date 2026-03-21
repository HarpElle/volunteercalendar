"use client";

import { useState, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { INTEGRATIONS } from "@/lib/integrations/config";
import type { IntegrationProvider, IntegrationConfig } from "@/lib/integrations/types";
import type { useAuth } from "@/lib/context/auth-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChMSStep = "select" | "connect" | "testing" | "connected" | "preview" | "select_teams" | "importing" | "done";

interface PreviewTeam {
  id: string;
  name: string;
  member_count: number;
}

interface QueueImportStats {
  queued: number;
  teams_selected: number;
  total_people: number;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ChMS Import Modal
// ---------------------------------------------------------------------------

interface ChMSImportModalProps {
  open: boolean;
  churchId: string;
  user: ReturnType<typeof useAuth>["user"];
  onDone: () => void;
  onCancel: () => void;
}

export function ChMSImportModal({
  open,
  churchId,
  user,
  onDone,
  onCancel,
}: ChMSImportModalProps) {
  const [step, setStep] = useState<ChMSStep>("select");
  const [selectedProvider, setSelectedProvider] = useState<IntegrationConfig | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStats, setImportStats] = useState<QueueImportStats | null>(null);
  const [previewTeams, setPreviewTeams] = useState<PreviewTeam[]>([]);
  const [previewPeopleCount, setPreviewPeopleCount] = useState(0);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [selectAllTeams, setSelectAllTeams] = useState(true);
  const [error, setError] = useState("");

  async function getAuthHeaders(): Promise<Record<string, string>> {
    if (!user) return {};
    const token = await user.getIdToken();
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }

  function selectProvider(config: IntegrationConfig) {
    setSelectedProvider(config);
    setCredentials({});
    setTestResult(null);
    setError("");
    setStep("connect");
  }

  async function testConnection() {
    if (!selectedProvider) return;
    setStep("testing");
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/import", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "test", provider: selectedProvider.provider, credentials, church_id: churchId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Connection test failed"); setTestResult(false); setStep("connect"); return; }
      setTestResult(data.connected);
      if (data.connected) {
        await fetch("/api/import", {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "save_creds", provider: selectedProvider.provider, credentials, church_id: churchId }),
        });
        setStep("connected");
      } else { setError("Could not connect. Please check your credentials."); setStep("connect"); }
    } catch { setError("Connection test failed. Please try again."); setStep("connect"); }
  }

  async function runPreview() {
    if (!selectedProvider) return;
    setError("");
    setStep("preview");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/import", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "preview", provider: selectedProvider.provider, credentials, church_id: churchId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Preview failed"); setStep("connected"); return; }
      setPreviewTeams(data.teams || []);
      setPreviewPeopleCount(data.total_people || 0);
      setSelectedTeamIds((data.teams || []).map((t: PreviewTeam) => t.id));
      setSelectAllTeams(true);
      setStep("select_teams");
    } catch { setError("Failed to load preview. Please try again."); setStep("connected"); }
  }

  async function runImportToQueue() {
    if (!selectedProvider) return;
    setImporting(true);
    setError("");
    setStep("importing");
    try {
      const headers = await getAuthHeaders();
      const teamIds = selectAllTeams ? undefined : selectedTeamIds;
      const res = await fetch("/api/import", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "import_to_queue", provider: selectedProvider.provider, credentials, church_id: churchId, team_ids: teamIds }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Import failed"); setStep("select_teams"); return; }
      setImportStats(data);
      setStep("done");
    } catch { setError("Import failed. Please try again."); setStep("select_teams"); } finally { setImporting(false); }
  }

  function startOver() {
    setStep("select");
    setSelectedProvider(null);
    setCredentials({});
    setTestResult(null);
    setImportStats(null);
    setPreviewTeams([]);
    setPreviewPeopleCount(0);
    setSelectedTeamIds([]);
    setSelectAllTeams(true);
    setError("");
  }

  // Conditional close: no-op during the "importing" step
  const handleClose = useCallback(() => {
    if (step === "importing") return;
    onCancel();
  }, [step, onCancel]);

  const STEP_LABELS: Record<ChMSStep, string> = {
    select: "Choose platform",
    connect: "Enter credentials",
    testing: "Testing connection",
    connected: "Connected",
    preview: "Loading preview",
    select_teams: "Select teams",
    importing: "Importing",
    done: "Complete",
  };

  const stepOrder: ChMSStep[] = ["select", "connect", "connected", "select_teams", "done"];
  const currentStepIdx = stepOrder.indexOf(
    step === "testing" ? "connect" : step === "preview" ? "select_teams" : step === "importing" ? "done" : step,
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import from ChMS"
      subtitle="One-time import from your church management system. Your existing data will not be affected."
      maxWidth="max-w-3xl"
    >
      {/* Step indicator */}
      {step !== "select" && (
        <div className="mb-6 flex items-center gap-2">
          {stepOrder.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className={`h-px w-6 ${i <= currentStepIdx ? "bg-vc-coral" : "bg-vc-border-light"}`} />}
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  i < currentStepIdx
                    ? "bg-vc-sage text-white"
                    : i === currentStepIdx
                      ? "bg-vc-coral text-white"
                      : "bg-vc-bg-warm text-vc-text-muted"
                }`}
              >
                {i < currentStepIdx ? (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-xs font-medium ${i === currentStepIdx ? "text-vc-indigo" : "text-vc-text-muted"}`}>
                {STEP_LABELS[s]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Select Provider */}
      {step === "select" && (
        <div className="grid gap-4 sm:grid-cols-3">
          {INTEGRATIONS.map((config) => (
            <button
              key={config.provider}
              onClick={() => selectProvider(config)}
              className="group rounded-xl border border-vc-border-light bg-vc-bg/50 p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.03] hover:border-vc-coral/40"
            >
              <ProviderIcon provider={config.provider} />
              <h3 className="mt-3 font-semibold text-vc-indigo">{config.label}</h3>
              <p className="mt-1 text-sm text-vc-text-secondary">{config.description}</p>
            </button>
          ))}
        </div>
      )}

      {/* Enter Credentials */}
      {(step === "connect" || step === "testing") && selectedProvider && (
        <div className="max-w-lg">
          <div className="flex items-center gap-3 mb-4">
            <ProviderIcon provider={selectedProvider.provider} />
            <div>
              <h3 className="font-semibold text-vc-indigo">{selectedProvider.label}</h3>
              <p className="text-xs text-vc-text-muted">Credentials are stored securely and only used for importing.</p>
            </div>
          </div>
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
                  onChange={(e) => setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-base text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                />
              </div>
            ))}
          </div>
          {error && <div className="mt-3 rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">{error}</div>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={startOver}>Back</Button>
            <Button
              onClick={testConnection}
              loading={step === "testing"}
              disabled={selectedProvider.authFields.some((f) => f.required && !credentials[f.key]?.trim())}
            >
              Test Connection
            </Button>
          </div>
        </div>
      )}

      {/* Connected -- load preview */}
      {step === "connected" && selectedProvider && (
        <div className="max-w-lg">
          <div className="flex items-center gap-3 rounded-lg bg-vc-sage/10 px-4 py-3 mb-4">
            <svg className="h-5 w-5 shrink-0 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <div>
              <p className="text-sm font-medium text-vc-sage">Connected to {selectedProvider.label}</p>
              <p className="text-xs text-vc-text-muted">Next, preview your teams and choose which ones to import.</p>
            </div>
          </div>
          {error && <div className="mb-3 rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={startOver}>Back</Button>
            <Button onClick={runPreview}>Preview Teams</Button>
          </div>
        </div>
      )}

      {/* Loading preview */}
      {step === "preview" && (
        <div className="max-w-lg text-center py-8">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-vc-coral/20 border-t-vc-coral" />
          <h3 className="font-semibold text-vc-indigo">Loading teams from {selectedProvider?.label}...</h3>
        </div>
      )}

      {/* Select teams */}
      {step === "select_teams" && selectedProvider && (
        <div className="max-w-lg">
          <div className="mb-4 rounded-lg bg-vc-bg-warm px-4 py-3">
            <p className="text-sm font-medium text-vc-indigo">
              Found {previewPeopleCount} people in {previewTeams.length} team{previewTeams.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-vc-text-muted mt-0.5">
              Select teams to import. People will be added to your review queue for approval before invites are sent.
            </p>
          </div>

          <div className="space-y-1 mb-4">
            <label className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-vc-bg-warm transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={selectAllTeams}
                onChange={(e) => {
                  setSelectAllTeams(e.target.checked);
                  setSelectedTeamIds(e.target.checked ? previewTeams.map((t) => t.id) : []);
                }}
                className="rounded border-vc-border text-vc-coral focus:ring-vc-coral"
              />
              <span className="text-sm font-medium text-vc-indigo">All Teams</span>
              <span className="ml-auto text-xs text-vc-text-muted">{previewPeopleCount} people</span>
            </label>
            <div className="my-1 border-t border-vc-border-light" />
            {previewTeams.map((team) => (
              <label key={team.id} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-vc-bg-warm transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectAllTeams || selectedTeamIds.includes(team.id)}
                  disabled={selectAllTeams}
                  onChange={(e) => {
                    setSelectedTeamIds((prev) =>
                      e.target.checked ? [...prev, team.id] : prev.filter((id) => id !== team.id),
                    );
                  }}
                  className="rounded border-vc-border text-vc-coral focus:ring-vc-coral"
                />
                <span className="text-sm text-vc-text-secondary">{team.name}</span>
                <span className="ml-auto text-xs text-vc-text-muted">{team.member_count} people</span>
              </label>
            ))}
          </div>

          {error && <div className="mb-3 rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStep("connected")}>Back</Button>
            <Button
              onClick={runImportToQueue}
              disabled={!selectAllTeams && selectedTeamIds.length === 0}
            >
              Import to Review Queue
            </Button>
          </div>
        </div>
      )}

      {/* Importing */}
      {step === "importing" && (
        <div className="max-w-lg text-center py-8">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-vc-coral/20 border-t-vc-coral" />
          <h3 className="font-semibold text-vc-indigo">Importing from {selectedProvider?.label}...</h3>
          <p className="mt-1 text-sm text-vc-text-secondary">
            This may take a minute for large organizations.
          </p>
        </div>
      )}

      {/* Done */}
      {step === "done" && importStats && (
        <div className="max-w-lg">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="People found" value={importStats.total_people} />
            <StatCard label="Added to queue" value={importStats.queued} />
            <StatCard label="Teams selected" value={importStats.teams_selected} />
          </div>
          <div className="mt-3 rounded-lg bg-vc-sage/10 px-4 py-3">
            <p className="text-sm font-medium text-vc-sage">
              {importStats.queued} people added to the review queue.
            </p>
            <p className="text-xs text-vc-text-muted mt-0.5">
              Review and approve them on the People page, then send invites.
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={startOver}>Import from another source</Button>
            <Button onClick={onDone}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
