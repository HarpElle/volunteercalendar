"use client";

import { useState, useRef, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/context/auth-context";
import type { ParsedSong } from "@/lib/integrations/songselect";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SongSelectImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: () => void;
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

  const [parsedSongs, setParsedSongs] = useState<ParsedSong[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---- File selection & parsing ----

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setError(null);
    setImportResult(null);
    setParsedSongs([]);
    setParseErrors([]);
    setSelected(new Set());

    const fileData: { name: string; content: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Only accept text-like files
      if (file.size > 500_000) {
        setParseErrors((prev) => [...prev, `${file.name}: File too large (max 500KB)`]);
        continue;
      }
      try {
        const content = await file.text();
        fileData.push({ name: file.name, content });
      } catch {
        setParseErrors((prev) => [...prev, `${file.name}: Could not read file`]);
      }
    }

    if (fileData.length === 0) return;

    // Parse client-side using the songselect parser
    const { parseSongFiles } = await import("@/lib/integrations/songselect");
    const result = parseSongFiles(fileData);

    setParsedSongs(result.songs);
    setParseErrors(result.errors);

    // Auto-select all parsed songs
    setSelected(new Set(result.songs.map((_, i) => i)));
  }, []);

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

  // ---- Toggle selection ----

  function toggleSelect(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  // ---- Import ----

  async function handleImport() {
    if (selected.size === 0 || !churchId || !user) return;

    setImporting(true);
    setError(null);
    setImportResult(null);

    try {
      const token = await user.getIdToken();
      const songsToImport = Array.from(selected).map((i) => parsedSongs[i]);

      const res = await fetch("/api/songselect/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          songs: songsToImport,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Import failed");
      }

      const data = await res.json();
      setImportResult({
        imported: data.imported,
        skipped: data.skipped,
        errors: data.errors?.map((e: { title: string; error: string }) => `${e.title}: ${e.error}`) || [],
      });

      if (data.imported > 0) {
        // Remove imported songs from the list
        const importedIndices = new Set(selected);
        setParsedSongs((prev) => prev.filter((_, i) => !importedIndices.has(i)));
        setSelected(new Set());
        onImportComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  // ---- Reset on close ----

  function handleClose() {
    setParsedSongs([]);
    setParseErrors([]);
    setSelected(new Set());
    setError(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import Songs"
      subtitle="Upload .usr or .txt files exported from the SongSelect website."
      maxWidth="max-w-3xl"
    >
      {/* Instructions */}
      <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-5">
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
              <li>3. Choose &quot;Lyrics&quot; or &quot;SongSelect File (.usr)&quot;</li>
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
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".usr,.txt,.text"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <svg className="mx-auto h-10 w-10 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
        </svg>
        <p className="mt-2 text-sm font-medium text-vc-indigo">
          Drop song files here or click to browse
        </p>
        <p className="mt-1 text-xs text-vc-text-muted">
          Accepts .usr and .txt files from SongSelect
        </p>
      </div>

      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <div className="mt-4 rounded-lg border border-vc-warning/20 bg-vc-warning/5 p-3 text-sm text-vc-warning">
          {parseErrors.map((err, i) => (
            <p key={i}>{err}</p>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-vc-danger/20 bg-vc-danger/5 p-3 text-sm text-vc-danger">
          {error}
        </div>
      )}

      {/* Import result banner */}
      {importResult && (
        <div className="mt-4 rounded-lg border border-vc-sage/30 bg-vc-sage/5 p-3 text-sm text-vc-sage-dark">
          {importResult.imported > 0 && (
            <span>
              {importResult.imported} song{importResult.imported !== 1 ? "s" : ""} imported.
            </span>
          )}
          {importResult.skipped > 0 && (
            <span className="ml-1">
              {importResult.skipped} already in your library.
            </span>
          )}
          {importResult.errors.length > 0 && (
            <div className="mt-1 text-vc-danger">
              {importResult.errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Parsed songs list */}
      {parsedSongs.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-vc-text-secondary">
              {parsedSongs.length} song{parsedSongs.length !== 1 ? "s" : ""} found
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (selected.size === parsedSongs.length) {
                    setSelected(new Set());
                  } else {
                    setSelected(new Set(parsedSongs.map((_, i) => i)));
                  }
                }}
              >
                {selected.size === parsedSongs.length ? "Deselect All" : "Select All"}
              </Button>
              {selected.size > 0 && (
                <Button size="sm" onClick={handleImport} disabled={importing}>
                  {importing ? (
                    <Spinner size="sm" />
                  ) : (
                    `Import ${selected.size} song${selected.size !== 1 ? "s" : ""}`
                  )}
                </Button>
              )}
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto rounded-xl border border-vc-border-light">
            {parsedSongs.map((song, idx) => {
              const isSelected = selected.has(idx);
              return (
                <label
                  key={idx}
                  className={`flex cursor-pointer items-start gap-3 border-b border-vc-border-light p-4 last:border-b-0 transition-colors ${
                    isSelected ? "bg-vc-indigo/5" : "hover:bg-vc-bg-warm/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-vc-border text-vc-indigo accent-vc-indigo"
                    checked={isSelected}
                    onChange={() => toggleSelect(idx)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-vc-text">
                        {song.title}
                      </span>
                      {song.default_key && (
                        <Badge variant="accent">{song.default_key}</Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-vc-text-secondary">
                      {song.artist_credit && (
                        <span>{song.artist_credit}</span>
                      )}
                      {song.ccli_number && (
                        <span>CCLI #{song.ccli_number}</span>
                      )}
                      {song.copyright && (
                        <span>{song.copyright}</span>
                      )}
                    </div>
                    {song.lyrics && (
                      <p className="mt-1 truncate text-xs text-vc-text-muted">
                        {song.lyrics.slice(0, 80)}...
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
