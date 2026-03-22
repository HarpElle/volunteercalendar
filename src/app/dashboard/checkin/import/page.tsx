"use client";

import { useState } from "react";
import { useAuth } from "@/lib/context/auth-context";

interface ImportResult {
  dry_run: boolean;
  households_created?: number;
  households_to_create?: number;
  children_created?: number;
  children_to_create?: number;
  skipped_rows: number;
  skipped_details?: string[];
}

/**
 * /dashboard/checkin/import — Breeze CSV import wizard.
 * Steps: Upload → Preview (dry run) → Confirm → Done
 */
export default function CheckInImportPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  const runDryRun = async () => {
    if (!user || !churchId || !csvText) return;
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/checkin/import/breeze", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          csv_text: csvText,
          dry_run: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Preview failed");
        return;
      }
      const data = (await res.json()) as ImportResult;
      setPreview(data);
      setStep("preview");
    } catch {
      setError("Network error");
    }
  };

  const runImport = async () => {
    if (!user || !churchId || !csvText) return;
    setStep("importing");
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/checkin/import/breeze", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          csv_text: csvText,
          dry_run: false,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Import failed");
        setStep("preview");
        return;
      }
      const data = (await res.json()) as ImportResult;
      setResult(data);
      setStep("done");
    } catch {
      setError("Network error");
      setStep("preview");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-vc-indigo font-display mb-6">
        Import from Breeze
      </h1>

      {step === "upload" && (
        <div className="max-w-lg">
          <p className="text-gray-500 mb-4">
            Upload a CSV export from Breeze ChMS containing children and guardian information.
            The file should include columns for First Name, Last Name, and at least one parent/guardian field.
          </p>

          <label className="block border-2 border-dashed border-gray-300 rounded-2xl p-8
            text-center cursor-pointer hover:border-vc-coral/50 transition-colors"
          >
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            {fileName ? (
              <div>
                <p className="text-vc-indigo font-medium">{fileName}</p>
                <p className="text-sm text-gray-400 mt-1">
                  {csvText.split("\n").length - 1} data rows
                </p>
              </div>
            ) : (
              <div>
                <svg
                  className="w-10 h-10 text-gray-300 mx-auto mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-gray-500">
                  Click to select a CSV file
                </p>
              </div>
            )}
          </label>

          {csvText && (
            <button
              type="button"
              onClick={runDryRun}
              className="mt-4 w-full h-12 rounded-full bg-vc-coral text-white font-semibold
                active:bg-vc-coral/90 transition-colors"
            >
              Preview Import
            </button>
          )}

          {error && (
            <p className="text-red-600 text-sm mt-3">{error}</p>
          )}
        </div>
      )}

      {step === "preview" && preview && (
        <div className="max-w-lg">
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="font-semibold text-vc-indigo mb-3">Preview Results</h2>
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium text-vc-indigo">
                  {preview.households_to_create}
                </span>{" "}
                households will be created
              </p>
              <p>
                <span className="font-medium text-vc-indigo">
                  {preview.children_to_create}
                </span>{" "}
                children will be created
              </p>
              {preview.skipped_rows > 0 && (
                <p className="text-amber-600">
                  {preview.skipped_rows} rows will be skipped (missing data)
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("upload")}
              className="flex-1 h-12 rounded-full border-2 border-gray-200 text-gray-600
                font-semibold transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={runImport}
              className="flex-1 h-12 rounded-full bg-vc-coral text-white font-semibold
                transition-colors"
            >
              Import Now
            </button>
          </div>

          {error && (
            <p className="text-red-600 text-sm mt-3">{error}</p>
          )}
        </div>
      )}

      {step === "importing" && (
        <div className="flex flex-col items-center py-12">
          <div className="w-10 h-10 border-4 border-vc-coral/30 border-t-vc-coral rounded-full animate-spin mb-4" />
          <p className="text-gray-600 font-medium">Importing data...</p>
        </div>
      )}

      {step === "done" && result && (
        <div className="max-w-lg">
          <div className="bg-vc-sage/10 rounded-xl border border-vc-sage/30 p-5 mb-4">
            <h2 className="font-semibold text-vc-sage mb-3 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Import Complete
            </h2>
            <div className="space-y-1 text-sm">
              <p>{result.households_created} households created</p>
              <p>{result.children_created} children created</p>
              {result.skipped_rows > 0 && (
                <p className="text-amber-600">
                  {result.skipped_rows} rows skipped
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setStep("upload");
              setCsvText("");
              setFileName("");
              setPreview(null);
              setResult(null);
            }}
            className="text-vc-coral font-medium underline"
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
