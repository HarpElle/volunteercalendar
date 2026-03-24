"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";

type ImportSource = "breeze" | "pco" | "generic";

interface ImportResult {
  dry_run: boolean;
  households_created?: number;
  households_to_create?: number;
  children_created?: number;
  children_to_create?: number;
  skipped_rows: number;
  skipped_details?: string[];
}

interface ColumnMap {
  first_name: number;
  last_name: number;
  guardian_name?: number;
  guardian_phone?: number;
  grade?: number;
  birthdate?: number;
  allergies?: number;
  medical_notes?: number;
}

const SOURCES: { key: ImportSource; label: string; description: string }[] = [
  {
    key: "breeze",
    label: "Breeze ChMS",
    description: "Import from a Breeze people export CSV",
  },
  {
    key: "pco",
    label: "Planning Center",
    description: "Import from a Planning Center people export CSV",
  },
  {
    key: "generic",
    label: "Other / CSV",
    description: "CCB, Elvanto, FellowshipOne, Rock RMS, or any CSV",
  },
];

/**
 * /dashboard/checkin/import — Multi-source family import wizard.
 * Steps: Source → Upload → (Column Map for generic) → Preview → Import → Done
 */
export default function CheckInImportPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [source, setSource] = useState<ImportSource | null>(null);
  const [step, setStep] = useState<
    "source" | "upload" | "map" | "preview" | "importing" | "done"
  >("source");
  const [csvText, setCsvText] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [columnMap, setColumnMap] = useState<ColumnMap>({
    first_name: -1,
    last_name: -1,
  });
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);

      // Parse headers for column mapping
      const firstLine = text.split("\n")[0];
      const headers = firstLine
        .split(",")
        .map((h) => h.replace(/^"|"$/g, "").trim());
      setCsvHeaders(headers);
    };
    reader.readAsText(file);
  };

  const getApiEndpoint = useCallback(() => {
    if (source === "breeze") return "/api/admin/checkin/import/breeze";
    if (source === "pco") return "/api/admin/checkin/import/pco";
    return "/api/admin/checkin/import/generic";
  }, [source]);

  const runDryRun = useCallback(async () => {
    if (!user || !churchId || !csvText || !source) return;
    setError("");
    try {
      const token = await user.getIdToken();
      const payload: Record<string, unknown> = {
        church_id: churchId,
        csv_text: csvText,
        dry_run: true,
      };
      if (source === "generic") {
        payload.column_map = columnMap;
      }
      const res = await fetch(getApiEndpoint(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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
  }, [user, churchId, csvText, source, columnMap, getApiEndpoint]);

  const runImport = useCallback(async () => {
    if (!user || !churchId || !csvText || !source) return;
    setStep("importing");
    setError("");
    try {
      const token = await user.getIdToken();
      const payload: Record<string, unknown> = {
        church_id: churchId,
        csv_text: csvText,
        dry_run: false,
      };
      if (source === "generic") {
        payload.column_map = columnMap;
      }
      const res = await fetch(getApiEndpoint(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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
  }, [user, churchId, csvText, source, columnMap, getApiEndpoint]);

  const resetAll = () => {
    setStep("source");
    setSource(null);
    setCsvText("");
    setCsvHeaders([]);
    setFileName("");
    setColumnMap({ first_name: -1, last_name: -1 });
    setPreview(null);
    setResult(null);
    setError("");
  };

  const handleNext = () => {
    if (step === "upload" && source === "generic") {
      setStep("map");
    } else if (step === "upload") {
      runDryRun();
    } else if (step === "map") {
      if (columnMap.first_name < 0 || columnMap.last_name < 0) {
        setError("First Name and Last Name columns are required");
        return;
      }
      runDryRun();
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-vc-indigo font-display mb-6">
        Import Families
      </h1>

      {/* Step 0: Source selector */}
      {step === "source" && (
        <div className="max-w-lg space-y-3">
          <p className="text-sm text-vc-text-secondary mb-4">
            Select the platform you&apos;re importing from. If yours isn&apos;t
            listed, use &quot;Other / CSV&quot; and map your columns manually.
          </p>
          {SOURCES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setSource(s.key);
                setStep("upload");
              }}
              className="w-full text-left rounded-xl border border-vc-border-light bg-vc-bg-warm
                p-5 hover:border-vc-coral/40 hover:shadow-sm transition-all"
            >
              <p className="font-semibold text-vc-indigo">{s.label}</p>
              <p className="text-sm text-vc-text-secondary mt-0.5">
                {s.description}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Step 1: File upload */}
      {step === "upload" && (
        <div className="max-w-lg">
          <button
            type="button"
            onClick={() => {
              setStep("source");
              setCsvText("");
              setFileName("");
              setCsvHeaders([]);
            }}
            className="mb-4 text-sm text-vc-text-secondary hover:text-vc-indigo flex items-center gap-1"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5 8.25 12l7.5-7.5"
              />
            </svg>
            Change source
          </button>

          <p className="text-sm text-vc-text-secondary mb-4">
            Upload a CSV export from{" "}
            <span className="font-medium text-vc-indigo">
              {SOURCES.find((s) => s.key === source)?.label}
            </span>
            .
            {source === "generic" &&
              " After uploading, you'll map your columns to the required fields."}
          </p>

          <label
            className="block border-2 border-dashed border-vc-border-light rounded-2xl p-8
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
                <p className="text-sm text-vc-text-muted mt-1">
                  {csvText.split("\n").length - 1} data rows
                </p>
              </div>
            ) : (
              <div>
                <svg
                  className="w-10 h-10 text-vc-border-light mx-auto mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                  />
                </svg>
                <p className="text-vc-text-secondary">
                  Click to select a CSV file
                </p>
              </div>
            )}
          </label>

          {csvText && (
            <button
              type="button"
              onClick={handleNext}
              className="mt-4 w-full h-12 rounded-full bg-vc-coral text-white font-semibold
                active:bg-vc-coral/90 transition-colors"
            >
              {source === "generic" ? "Map Columns" : "Preview Import"}
            </button>
          )}

          {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        </div>
      )}

      {/* Step 2 (generic only): Column mapping */}
      {step === "map" && (
        <div className="max-w-lg">
          <button
            type="button"
            onClick={() => setStep("upload")}
            className="mb-4 text-sm text-vc-text-secondary hover:text-vc-indigo flex items-center gap-1"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5 8.25 12l7.5-7.5"
              />
            </svg>
            Back
          </button>

          <h2 className="font-semibold text-vc-indigo mb-1">
            Map Your Columns
          </h2>
          <p className="text-sm text-vc-text-secondary mb-4">
            Tell us which column in your CSV corresponds to each field.
            Only First Name and Last Name are required.
          </p>

          <div className="space-y-3">
            {(
              [
                { key: "first_name", label: "First Name", required: true },
                { key: "last_name", label: "Last Name", required: true },
                { key: "guardian_name", label: "Guardian / Family Name" },
                { key: "guardian_phone", label: "Guardian Phone" },
                { key: "grade", label: "Grade / Class" },
                { key: "birthdate", label: "Birthdate" },
                { key: "allergies", label: "Allergies" },
                { key: "medical_notes", label: "Medical Notes" },
              ] as {
                key: keyof ColumnMap;
                label: string;
                required?: boolean;
              }[]
            ).map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
                  {field.label}
                  {field.required && (
                    <span className="text-vc-coral ml-0.5">*</span>
                  )}
                </label>
                <select
                  value={columnMap[field.key] ?? -1}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setColumnMap((m) => ({
                      ...m,
                      [field.key]: val >= 0 ? val : undefined,
                    }));
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white
                    px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
                >
                  <option value={-1}>-- Skip --</option>
                  {csvHeaders.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleNext}
            disabled={columnMap.first_name < 0 || columnMap.last_name < 0}
            className="mt-6 w-full h-12 rounded-full bg-vc-coral text-white font-semibold
              active:bg-vc-coral/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Preview Import
          </button>

          {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        </div>
      )}

      {/* Step 3: Preview */}
      {step === "preview" && preview && (
        <div className="max-w-lg">
          <div className="bg-white rounded-xl border border-vc-border-light p-5 mb-4">
            <h2 className="font-semibold text-vc-indigo mb-3">
              Preview Results
            </h2>
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
              onClick={() =>
                setStep(source === "generic" ? "map" : "upload")
              }
              className="flex-1 h-12 rounded-full border-2 border-vc-border-light text-vc-text-secondary
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

          {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        </div>
      )}

      {/* Step 4: Importing */}
      {step === "importing" && (
        <div className="flex flex-col items-center py-12">
          <div className="w-10 h-10 border-4 border-vc-coral/30 border-t-vc-coral rounded-full animate-spin mb-4" />
          <p className="text-vc-text-secondary font-medium">
            Importing data...
          </p>
        </div>
      )}

      {/* Step 5: Done */}
      {step === "done" && result && (
        <div className="max-w-lg">
          <div className="bg-vc-sage/10 rounded-xl border border-vc-sage/30 p-5 mb-4">
            <h2 className="font-semibold text-vc-sage mb-3 flex items-center gap-2">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
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
            onClick={resetAll}
            className="text-vc-coral font-medium underline"
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
