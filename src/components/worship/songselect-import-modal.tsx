"use client";

import { useState, useCallback, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/context/auth-context";
import { isAdmin, isOwner } from "@/lib/utils/permissions";
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
  /** Whether the church already has SongSelect connected */
  isConnected?: boolean;
  /** Called after a successful connect so parent can update status */
  onConnected?: () => void;
}

// ---------------------------------------------------------------------------
// Connect Form (inline)
// ---------------------------------------------------------------------------

function ConnectForm({
  churchId,
  onConnected,
}: {
  churchId: string;
  onConnected: () => void;
}) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    if (!email.trim() || !password.trim() || !user) return;
    setConnecting(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/songselect/connect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          email,
          password,
          auto_sync_enabled: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Connection failed");
      }

      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header illustration area */}
      <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-5 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-vc-indigo/10">
          <svg className="h-6 w-6 text-vc-indigo" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
          </svg>
        </div>
        <h3 className="font-display text-lg text-vc-indigo">Connect SongSelect</h3>
        <p className="mt-1 text-sm text-vc-text-secondary">
          Sign in with your CCLI SongSelect credentials to search and import songs directly into your library.
        </p>
      </div>

      {/* Credential fields */}
      <div className="space-y-3">
        <Input
          label="SongSelect Email"
          type="email"
          placeholder="worship@yourchurch.org"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <Input
          label="SongSelect Password"
          type="password"
          placeholder="Enter your SongSelect password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConnect();
          }}
          autoComplete="current-password"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-vc-danger/20 bg-vc-danger/5 p-3 text-sm text-vc-danger">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-vc-text-muted">
          Credentials are stored securely and only used for SongSelect access.
        </p>
        <Button
          onClick={handleConnect}
          disabled={connecting || !email.trim() || !password.trim()}
          className="min-h-[44px] shrink-0"
        >
          {connecting ? <Spinner size="sm" /> : "Connect"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SongSelectImportModal({
  open,
  onClose,
  onImportComplete,
  isConnected: isConnectedProp,
  onConnected,
}: SongSelectImportModalProps) {
  const { user, activeMembership, profile } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;
  const canManage = isAdmin(activeMembership) || isOwner(activeMembership);

  const [connected, setConnected] = useState(isConnectedProp ?? false);
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

  // Sync prop → state
  useEffect(() => {
    if (isConnectedProp !== undefined) setConnected(isConnectedProp);
  }, [isConnectedProp]);

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
        // If we get a "not connected" error from the API, flip to connect view
        if (res.status === 422 && data.error?.includes("not connected")) {
          setConnected(false);
          setSearching(false);
          return;
        }
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

  // ---- Handle successful connection ----

  function handleConnected() {
    setConnected(true);
    onConnected?.();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import from SongSelect"
      subtitle={connected
        ? "Search the CCLI SongSelect catalog and import songs to your library."
        : "Connect your CCLI SongSelect account to get started."
      }
      maxWidth="max-w-3xl"
    >
      {/* Not connected — show connect form or non-admin message */}
      {!connected && (
        canManage && churchId ? (
          <ConnectForm churchId={churchId} onConnected={handleConnected} />
        ) : (
          <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-vc-sand/20">
              <svg className="h-6 w-6 text-vc-warning" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <h3 className="font-display text-lg text-vc-indigo">SongSelect Not Connected</h3>
            <p className="mt-2 text-sm text-vc-text-secondary">
              Ask an administrator to connect SongSelect in Organization Settings.
            </p>
          </div>
        )
      )}

      {/* Connected — show search & import UI */}
      {connected && (
        <>
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
        </>
      )}
    </Modal>
  );
}
