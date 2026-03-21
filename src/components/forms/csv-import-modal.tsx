"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { addChurchDocument } from "@/lib/firebase/firestore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a single CSV line handling quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// CSV Import Modal
// ---------------------------------------------------------------------------

interface CSVImportModalProps {
  open: boolean;
  churchId: string;
  onQueued: (count: number) => void;
  onCancel: () => void;
}

export function CSVImportModal({
  open,
  churchId,
  onQueued,
  onCancel,
}: CSVImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{ count: number; errors: string[] } | null>(null);

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSaving(true);
    setImportStatus(null);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        setImportStatus({ count: 0, errors: ["CSV file is empty or has no data rows."] });
        setSaving(false);
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const nameIdx = headers.findIndex((h) => h === "name" || h === "full name" || h === "volunteer");
      const emailIdx = headers.findIndex((h) => h === "email" || h === "email address");
      const phoneIdx = headers.findIndex((h) => h === "phone" || h === "phone number" || h === "mobile");

      if (nameIdx === -1) {
        setImportStatus({ count: 0, errors: ["CSV must have a 'name' column."] });
        setSaving(false);
        return;
      }

      let queued = 0;
      const errors: string[] = [];
      const now = new Date().toISOString();

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const volName = cols[nameIdx]?.trim();
        if (!volName) {
          errors.push(`Row ${i + 1}: missing name, skipped.`);
          continue;
        }

        const email = emailIdx >= 0 ? cols[emailIdx]?.trim() || "" : "";
        const phone = phoneIdx >= 0 ? cols[phoneIdx]?.trim() || null : null;

        try {
          await addChurchDocument(churchId, "invite_queue", {
            church_id: churchId,
            name: volName,
            email,
            phone,
            role: "volunteer",
            ministry_ids: [],
            source: "csv",
            source_provider: null,
            status: "pending_review",
            volunteer_id: null,
            error_message: null,
            reviewed_by: null,
            reviewed_at: null,
            sent_at: null,
            created_at: now,
          });
          queued++;
        } catch {
          errors.push(`Row ${i + 1}: failed to queue "${volName}".`);
        }
      }

      setImportStatus({ count: queued, errors });
      if (queued > 0) onQueued(queued);
    } catch {
      setImportStatus({ count: 0, errors: ["Failed to read CSV file."] });
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Import from CSV"
      subtitle="Upload a spreadsheet with name (required), email, and phone columns. People will be added to your review queue."
    >
      {!importStatus ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer rounded-xl border-2 border-dashed border-vc-border bg-vc-bg/50 px-6 py-10 text-center transition-colors hover:border-vc-coral/40 hover:bg-vc-coral/5"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCSVImport}
            className="hidden"
          />
          {saving ? (
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-vc-coral/20 border-t-vc-coral" />
              <p className="text-sm font-medium text-vc-indigo">Importing {fileName}...</p>
            </div>
          ) : (
            <>
              <svg className="mx-auto h-10 w-10 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              <p className="mt-3 text-sm font-medium text-vc-indigo">
                Click to choose a CSV file
              </p>
              <p className="mt-1 text-xs text-vc-text-muted">
                Columns: <strong>name</strong> (required), email, phone. You&apos;ll review and approve before invites are sent.
              </p>
            </>
          )}
        </div>
      ) : (
        <div>
          {importStatus.count > 0 && (
            <div className="flex items-center gap-3 rounded-lg bg-vc-sage/10 px-4 py-3">
              <svg className="h-5 w-5 shrink-0 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              <p className="text-sm font-medium text-vc-sage">
                Added {importStatus.count} {importStatus.count !== 1 ? "people" : "person"} to the review queue.
              </p>
            </div>
          )}
          {importStatus.errors.length > 0 && (
            <div className="mt-3 rounded-lg bg-vc-danger/5 p-4">
              <p className="mb-1 text-xs font-semibold text-vc-danger">Issues</p>
              <div className="space-y-0.5">
                {importStatus.errors.map((err, i) => (
                  <p key={i} className="text-xs text-vc-danger/80">{err}</p>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setImportStatus(null); setFileName(null); }}>
              Import more
            </Button>
            <Button onClick={onCancel}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
