"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/context/auth-context";
import { getDocument } from "@/lib/firebase/firestore";
import type { Church, SongChartData } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SongSelectImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

type ImportStep = "upload" | "preview" | "result";

interface PreviewSong {
  title: string;
  artist: string | null;
  writers: string | null;
  key: string | null;
  tempo: number | null;
  time_signature: string | null;
  ccli_number: string | null;
  copyright: string | null;
  chart_data: SongChartData;
  file: File;
  file_type: "chordpro" | "pdf";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHORDPRO_EXTENSIONS = new Set(["pro", "chordpro", "cho"]);

function getFileExtension(name: string): string {
  return name.toLowerCase().split(".").pop() || "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SongSelectImportModal({
  open,
  onClose,
  onImportComplete,
}: SongSelectImportModalProps) {
  const { user, activeMembership, profile } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("upload");
  const [churchCcli, setChurchCcli] = useState<string | null>(null);
  const [ccliLoading, setCcliLoading] = useState(true);
  const [previewSongs, setPreviewSongs] = useState<PreviewSong[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    duplicates: number;
    added_keys: number;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---- Fetch church CCLI number on open ----

  useEffect(() => {
    if (!open || !churchId) return;
    setCcliLoading(true);
    getDocument("churches", churchId)
      .then((data) => {
        const church = data as Church | null;
        setChurchCcli(church?.ccli_number || null);
      })
      .catch(() => setChurchCcli(null))
      .finally(() => setCcliLoading(false));
  }, [open, churchId]);

  // ---- File handling ----

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;

    setError(null);
    setParseErrors([]);
    setProcessing(true);

    const newSongs: PreviewSong[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = getFileExtension(file.name);

      // Size limit
      if (file.size > 5 * 1024 * 1024) {
        errors.push(`${file.name}: File too large (max 5 MB)`);
        continue;
      }

      try {
        if (CHORDPRO_EXTENSIONS.has(ext)) {
          // --- ChordPro: parse client-side ---
          const content = await file.text();
          const { parseChordPro } = await import("@/lib/music/chordpro-parser");
          const chartData = parseChordPro(content);

          newSongs.push({
            title: chartData.metadata.title,
            artist: chartData.metadata.artist,
            writers: chartData.metadata.writers,
            key: chartData.metadata.original_key,
            tempo: chartData.metadata.tempo,
            time_signature: chartData.metadata.time_signature,
            ccli_number: chartData.metadata.ccli_number,
            copyright: chartData.metadata.copyright,
            chart_data: chartData,
            file,
            file_type: "chordpro",
          });
        } else if (ext === "pdf") {
          // --- PDF: send to conversion API ---
          const token = await user.getIdToken();
          const formData = new FormData();
          formData.append("file", file);

          const res = await fetch("/api/songselect/convert-pdf", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });

          if (!res.ok) {
            const data = await res.json();
            errors.push(`${file.name}: ${data.error || "PDF conversion failed"}`);
            continue;
          }

          const { metadata } = (await res.json()) as {
            metadata: {
              title: string;
              artist: string | null;
              writers: string | null;
              original_key: string | null;
              tempo: number | null;
              time_signature: string | null;
              ccli_number: string | null;
              copyright: string | null;
            };
          };

          // Build metadata-only chart_data (no sections — PDF is displayed natively)
          const chartData: SongChartData = {
            metadata,
            sections: [],
          };

          newSongs.push({
            title: metadata.title,
            artist: metadata.artist,
            writers: metadata.writers,
            key: metadata.original_key,
            tempo: metadata.tempo,
            time_signature: metadata.time_signature,
            ccli_number: metadata.ccli_number,
            copyright: metadata.copyright,
            chart_data: chartData,
            file,
            file_type: "pdf",
          });
        } else {
          errors.push(
            `${file.name}: Unsupported file type. Upload ChordPro (.pro, .chordpro) or PDF files.`,
          );
        }
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : "Processing failed"}`);
      }
    }

    setParseErrors(errors);
    if (newSongs.length > 0) {
      setPreviewSongs(newSongs);
      setStep("preview");
    }
    setProcessing(false);
  }, [user]);

  // ---- Drag & drop ----

  const [dragOver, setDragOver] = useState(false);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  // ---- Import (via upload API) ----

  async function handleImport(song: PreviewSong) {
    if (!churchId || !user) return;

    setImporting(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append("file", song.file);
      formData.append("church_id", churchId);
      formData.append("chart_data", JSON.stringify(song.chart_data));
      formData.append("file_type", song.file_type);

      const res = await fetch("/api/songselect/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Import failed");
      }

      const result = await res.json();

      // Remove from preview list
      setPreviewSongs((prev) => prev.filter((s) => s !== song));

      if (result.added_key) {
        // Multi-key PDF bundled under existing song
        setImportResult((prev) => ({
          imported: prev?.imported || 0,
          duplicates: prev?.duplicates || 0,
          added_keys: (prev?.added_keys || 0) + 1,
          errors: prev?.errors || [],
        }));
      } else {
        setImportResult((prev) => ({
          imported: (prev?.imported || 0) + 1,
          duplicates: prev?.duplicates || 0,
          added_keys: prev?.added_keys || 0,
          errors: prev?.errors || [],
        }));
      }

      onImportComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      if (msg.includes("already exists")) {
        setImportResult((prev) => ({
          imported: prev?.imported || 0,
          duplicates: (prev?.duplicates || 0) + 1,
          added_keys: prev?.added_keys || 0,
          errors: prev?.errors || [],
        }));
        setPreviewSongs((prev) => prev.filter((s) => s !== song));
      } else {
        setError(msg);
      }
    } finally {
      setImporting(false);
    }
  }

  async function handleImportAll() {
    for (const song of [...previewSongs]) {
      await handleImport(song);
    }
    if (previewSongs.length === 0) {
      setStep("result");
    }
  }

  // ---- Reset on close ----

  function handleClose() {
    setStep("upload");
    setPreviewSongs([]);
    setParseErrors([]);
    setError(null);
    setImportResult(null);
    setProcessing(false);
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  }

  // ---- CCLI gate check ----
  const hasCcli = !!churchCcli;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import Songs from SongSelect"
      subtitle="Upload ChordPro or PDF chord chart files from SongSelect."
      maxWidth="max-w-3xl"
    >
      {/* CCLI Compliance Banner */}
      <div className="rounded-xl border border-vc-sand/40 bg-vc-sand/10 p-4">
        <p className="text-sm text-vc-text-secondary">
          All songs are stored privately in your account and used only under your
          church&apos;s CCLI license. Your CCLI number is included automatically in
          usage reports for easy submission to CCLI.
        </p>
      </div>

      {ccliLoading ? (
        <div className="mt-6 flex justify-center py-8">
          <Spinner />
        </div>
      ) : !hasCcli ? (
        /* CCLI Gate — prompt user to set up CCLI number first */
        <div className="mt-4 rounded-xl border border-vc-warning/20 bg-vc-warning/5 p-6 text-center">
          <svg className="mx-auto h-12 w-12 text-vc-warning" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <h3 className="mt-3 text-base font-semibold text-vc-indigo">
            CCLI License Required
          </h3>
          <p className="mt-2 text-sm text-vc-text-secondary">
            To import songs from SongSelect, your organization must have a CCLI Church
            Copyright License number on file. Go to{" "}
            <span className="font-medium text-vc-indigo">Settings &gt; General</span>{" "}
            to add your CCLI number.
          </p>
          <Button variant="outline" className="mt-4" onClick={handleClose}>
            Close
          </Button>
        </div>
      ) : step === "upload" ? (
        <>
          {/* Instructions */}
          <div className="mt-4 rounded-xl border border-vc-border-light bg-vc-bg-warm p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-vc-indigo/10">
                <svg className="h-5 w-5 text-vc-indigo" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-vc-indigo">How to export from SongSelect</h3>
                <ol className="mt-1.5 space-y-1 text-sm text-vc-text-secondary">
                  <li>1. Sign in at songselect.ccli.com</li>
                  <li>2. Find your song and click the download icon</li>
                  <li>3. Choose <strong>ChordPro</strong> (Premium) or <strong>Chord Chart PDF</strong></li>
                  <li>4. Upload the downloaded file(s) below</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Drop zone / File picker */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`mt-4 cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragOver
                ? "border-vc-coral bg-vc-coral/5"
                : "border-vc-border-light hover:border-vc-indigo/30 hover:bg-vc-bg-warm/50"
            }`}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pro,.chordpro,.cho,.pdf"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            {processing ? (
              <div className="flex flex-col items-center gap-3">
                <Spinner />
                <p className="text-sm text-vc-text-secondary">Processing files...</p>
              </div>
            ) : (
              <>
                <svg className="mx-auto h-10 w-10 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                <p className="mt-2 text-sm font-medium text-vc-indigo">
                  Drop song files here or click to browse
                </p>
                <div className="mt-3 flex flex-col items-center gap-1">
                  <Badge variant="accent">ChordPro (.pro, .chordpro)</Badge>
                  <span className="text-xs text-vc-text-muted">Best quality — requires CCLI Premium</span>
                </div>
                <div className="mt-2 flex flex-col items-center gap-1">
                  <Badge variant="default">PDF Chord Chart</Badge>
                  <span className="text-xs text-vc-text-muted">Converted automatically — all SongSelect subscriptions</span>
                </div>
              </>
            )}
          </div>

          {/* Parse errors from upload attempt */}
          {parseErrors.length > 0 && (
            <div className="mt-4 rounded-lg border border-vc-warning/20 bg-vc-warning/5 p-3 text-sm text-vc-warning">
              {parseErrors.map((err, i) => (
                <p key={i}>{err}</p>
              ))}
            </div>
          )}
        </>
      ) : step === "preview" ? (
        <>
          {/* Preview header */}
          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-vc-text-secondary">
                {previewSongs.length} song{previewSongs.length !== 1 ? "s" : ""} ready to import
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep("upload");
                  setPreviewSongs([]);
                  setParseErrors([]);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                Upload More
              </Button>
              <Button
                size="sm"
                onClick={handleImportAll}
                disabled={importing || previewSongs.length === 0}
              >
                {importing ? (
                  <Spinner size="sm" />
                ) : (
                  `Import All (${previewSongs.length})`
                )}
              </Button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-3 rounded-lg border border-vc-danger/20 bg-vc-danger/5 p-3 text-sm text-vc-danger">
              {error}
            </div>
          )}

          {/* Import result banner */}
          {importResult && (importResult.imported > 0 || importResult.duplicates > 0 || importResult.added_keys > 0) && (
            <div className="mt-3 rounded-lg border border-vc-sage/30 bg-vc-sage/5 p-3 text-sm text-vc-sage-dark">
              {importResult.imported > 0 && (
                <span>{importResult.imported} song{importResult.imported !== 1 ? "s" : ""} imported. </span>
              )}
              {importResult.added_keys > 0 && (
                <span>{importResult.added_keys} additional key{importResult.added_keys !== 1 ? "s" : ""} added to existing song{importResult.added_keys !== 1 ? "s" : ""}. </span>
              )}
              {importResult.duplicates > 0 && (
                <span>{importResult.duplicates} already in your library.</span>
              )}
            </div>
          )}

          {/* Preview cards */}
          <div className="mt-3 max-h-[450px] space-y-3 overflow-y-auto">
            {previewSongs.map((song, idx) => (
              <SongPreviewCard
                key={`${song.title}-${idx}`}
                song={song}
                onImport={() => handleImport(song)}
                importing={importing}
              />
            ))}
          </div>

          {/* Show result step when all songs imported */}
          {previewSongs.length === 0 && importResult && (
            <div className="mt-4 text-center">
              <Button onClick={handleClose}>Done</Button>
            </div>
          )}
        </>
      ) : (
        /* Result step */
        <div className="mt-4 text-center py-6">
          <svg className="mx-auto h-12 w-12 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <h3 className="mt-3 text-lg font-semibold text-vc-indigo">Import Complete</h3>
          {importResult && (
            <p className="mt-1 text-sm text-vc-text-secondary">
              {importResult.imported} song{importResult.imported !== 1 ? "s" : ""} imported
              {importResult.added_keys > 0 && `, ${importResult.added_keys} key${importResult.added_keys !== 1 ? "s" : ""} added`}
              {importResult.duplicates > 0 && `, ${importResult.duplicates} skipped (already in library)`}
            </p>
          )}
          <Button className="mt-4" onClick={handleClose}>Done</Button>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Song Preview Card — shows parsed metadata + first section with chords
// ---------------------------------------------------------------------------

function SongPreviewCard({
  song,
  onImport,
  importing,
}: {
  song: PreviewSong;
  onImport: () => void;
  importing: boolean;
}) {
  const firstSection = song.chart_data.sections[0];

  return (
    <div className="rounded-xl border border-vc-border-light bg-white p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-base font-semibold text-vc-indigo">
              {song.title}
            </h4>
            <Badge variant={song.file_type === "chordpro" ? "accent" : "default"}>
              {song.file_type === "chordpro" ? "ChordPro" : "PDF"}
            </Badge>
          </div>
          {(song.writers || song.artist) && (
            <p className="mt-0.5 text-sm text-vc-text-secondary">
              {song.writers || song.artist}
            </p>
          )}
        </div>
        <Button size="sm" onClick={onImport} disabled={importing}>
          {importing ? <Spinner size="sm" /> : "Import"}
        </Button>
      </div>

      {/* Metadata badges */}
      <div className="mt-2 flex flex-wrap gap-2">
        {song.key && (
          <Badge variant="accent">Key: {song.key}</Badge>
        )}
        {song.tempo && (
          <Badge variant="default">{song.tempo} BPM</Badge>
        )}
        {song.time_signature && (
          <Badge variant="default">{song.time_signature}</Badge>
        )}
        {song.ccli_number && (
          <Badge variant="default">CCLI #{song.ccli_number}</Badge>
        )}
      </div>

      {/* Content preview — ChordPro shows chord/lyric structure, PDF shows notice */}
      {song.file_type === "pdf" ? (
        <div className="mt-3 rounded-lg bg-vc-bg-warm p-3 flex items-center gap-3">
          <svg className="h-8 w-8 shrink-0 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-vc-indigo">PDF will be stored for native viewing</p>
            <p className="text-xs text-vc-text-muted">The original PDF layout will be preserved exactly as-is.</p>
          </div>
        </div>
      ) : firstSection ? (
        <div className="mt-3 rounded-lg bg-vc-bg-warm p-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-vc-text-muted">
            {firstSection.label}
          </p>
          {firstSection.lines.slice(0, 4).map((line, li) => {
            const hasChords = line.segments.some((s) => s.chord);
            return (
              <div key={li} className="mb-1 whitespace-pre-wrap">
                {line.segments.map((seg, si) => (
                  <span
                    key={si}
                    style={{ display: "inline-flex", flexDirection: "column", verticalAlign: "bottom" }}
                  >
                    {hasChords && (
                      <span className={`text-xs font-semibold ${seg.chord ? "text-vc-coral" : "invisible"}`}>
                        {seg.chord || "\u00A0"}
                      </span>
                    )}
                    <span className="text-sm text-vc-text">{seg.lyrics || "\u00A0"}</span>
                  </span>
                ))}
              </div>
            );
          })}
          {firstSection.lines.length > 4 && (
            <p className="mt-1 text-xs text-vc-text-muted italic">
              ...and {firstSection.lines.length - 4} more line{firstSection.lines.length - 4 !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      ) : null}

      {/* Copyright */}
      {song.copyright && (
        <p className="mt-2 text-xs text-vc-text-muted">{song.copyright}</p>
      )}
    </div>
  );
}
