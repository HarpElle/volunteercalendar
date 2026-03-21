"use client";

import { useState, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/context/auth-context";
import type { SongSelectSearchResult } from "@/lib/integrations/songselect";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnrichedResult extends SongSelectSearchResult {
  already_imported: boolean;
}

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

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EnrichedResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: { songselect_id: string; error: string }[];
  } | null>(null);

  // ---- Search ----

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !churchId || !user) return;

    setSearching(true);
    setSearchError(null);
    setResults([]);
    setSelected(new Set());
    setImportResult(null);

    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ church_id: churchId, q: query });
      const res = await fetch(`/api/songselect/search?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Search failed (${res.status})`);
      }

      const data = await res.json();
      setResults(data.results ?? []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [query, churchId, user]);

  // ---- Toggle selection ----

  function toggleSelect(songselectId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(songselectId)) {
        next.delete(songselectId);
      } else {
        next.add(songselectId);
      }
      return next;
    });
  }

  // ---- Import ----

  async function handleImport() {
    if (selected.size === 0 || !churchId || !user) return;

    setImporting(true);
    setImportResult(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/songselect/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          songselect_ids: Array.from(selected),
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
        errors: data.errors,
      });

      // Mark imported songs in results
      if (data.imported > 0) {
        setResults((prev) =>
          prev.map((r) =>
            selected.has(r.songselect_id)
              ? { ...r, already_imported: true }
              : r,
          ),
        );
        setSelected(new Set());
        onImportComplete();
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  // ---- Reset on close ----

  function handleClose() {
    setQuery("");
    setResults([]);
    setSelected(new Set());
    setSearchError(null);
    setImportResult(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import from SongSelect"
      subtitle="Search the CCLI SongSelect catalog and import songs to your library."
      maxWidth="max-w-3xl"
    >
      {/* Search bar */}
      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            placeholder="Search by title, artist, or CCLI number..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            aria-label="Search SongSelect"
          />
        </div>
        <Button onClick={handleSearch} disabled={searching || !query.trim()}>
          {searching ? <Spinner size="sm" /> : "Search"}
        </Button>
      </div>

      {/* Error */}
      {searchError && (
        <div className="mt-4 rounded-lg border border-vc-danger/20 bg-vc-danger/5 p-3 text-sm text-vc-danger">
          {searchError}
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
            <span className="ml-1 text-vc-danger">
              {importResult.errors.length} failed.
            </span>
          )}
        </div>
      )}

      {/* Loading */}
      {searching && (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {/* Results */}
      {!searching && results.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-vc-text-secondary">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </p>
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

          <div className="max-h-[400px] overflow-y-auto rounded-xl border border-vc-border-light">
            {results.map((result) => {
              const isSelected = selected.has(result.songselect_id);
              const isImported = result.already_imported;

              return (
                <label
                  key={result.songselect_id}
                  className={`flex cursor-pointer items-start gap-3 border-b border-vc-border-light p-4 last:border-b-0 transition-colors ${
                    isSelected
                      ? "bg-vc-indigo/5"
                      : isImported
                        ? "bg-vc-bg-warm/50 opacity-60"
                        : "hover:bg-vc-bg-warm/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-vc-border text-vc-indigo accent-vc-indigo"
                    checked={isSelected}
                    disabled={isImported}
                    onChange={() => toggleSelect(result.songselect_id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-vc-text truncate">
                        {result.title}
                      </span>
                      {isImported && (
                        <Badge variant="success">In Library</Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-vc-text-secondary">
                      {result.artist_credit && (
                        <span>{result.artist_credit}</span>
                      )}
                      {result.ccli_number && (
                        <span>CCLI #{result.ccli_number}</span>
                      )}
                      {result.default_key && (
                        <span>Key: {result.default_key}</span>
                      )}
                    </div>
                    {result.themes.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {result.themes.slice(0, 4).map((theme) => (
                          <Badge key={theme} variant="default">
                            {theme}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!searching && results.length === 0 && query && !searchError && (
        <div className="py-12 text-center text-vc-text-secondary">
          No results found. Try a different search term.
        </div>
      )}
    </Modal>
  );
}
