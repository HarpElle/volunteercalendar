"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/context/auth-context";
import type { SongArrangement } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArrangementsPanelProps {
  songId: string;
  churchId: string;
  activeArrangementId: string | null;
  onSelect: (arrangement: SongArrangement) => void;
  onArrangementsLoaded?: (arrangements: SongArrangement[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArrangementsPanel({
  songId,
  churchId,
  activeArrangementId,
  onSelect,
  onArrangementsLoaded,
}: ArrangementsPanelProps) {
  const { user } = useAuth();
  const [arrangements, setArrangements] = useState<SongArrangement[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // ---- Fetch arrangements ----

  const loadArrangements = useCallback(async () => {
    if (!user || !churchId || !songId) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/arrangements?church_id=${churchId}&song_id=${songId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setArrangements(data.arrangements);
        onArrangementsLoaded?.(data.arrangements);
      }
    } catch {
      // silently fail — arrangements panel is supplementary
    } finally {
      setLoading(false);
    }
  }, [user, churchId, songId, onArrangementsLoaded]);

  useEffect(() => {
    loadArrangements();
  }, [loadArrangements]);

  // ---- Create arrangement ----

  async function handleCreate(cloneFrom?: string) {
    if (!user || !newName.trim()) return;
    setCreating(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/arrangements", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          song_id: songId,
          name: newName.trim(),
          clone_from: cloneFrom || undefined,
        }),
      });
      if (res.ok) {
        const arrangement = await res.json();
        setArrangements((prev) => [...prev, arrangement]);
        setNewName("");
        setShowCreate(false);
        onSelect(arrangement);
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  // ---- Set as default ----

  async function handleSetDefault(arrangementId: string) {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/arrangements/${arrangementId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          is_default: true,
        }),
      });
      if (res.ok) {
        setArrangements((prev) =>
          prev.map((a) => ({
            ...a,
            is_default: a.id === arrangementId,
          })),
        );
      }
    } catch {
      // ignore
    }
  }

  // ---- Delete ----

  async function handleDelete(arrangementId: string) {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch(`/api/arrangements/${arrangementId}?church_id=${churchId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setArrangements((prev) => prev.filter((a) => a.id !== arrangementId));
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-vc-indigo">Arrangements</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? "Cancel" : "+ New"}
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="flex items-center gap-2 rounded-lg border border-vc-border-light bg-vc-bg-warm p-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Arrangement name..."
            className="flex-1 rounded-md border border-vc-border-light bg-white px-2 py-1 text-sm focus:border-vc-indigo focus:outline-none focus:ring-1 focus:ring-vc-indigo"
          />
          <Button
            size="sm"
            onClick={() => handleCreate()}
            disabled={creating || !newName.trim()}
          >
            {creating ? <Spinner size="sm" /> : "Create"}
          </Button>
        </div>
      )}

      {/* Arrangement list */}
      {arrangements.length === 0 ? (
        <p className="text-sm text-vc-text-muted">No arrangements yet.</p>
      ) : (
        <div className="space-y-1">
          {arrangements.map((arr) => {
            const isActive = arr.id === activeArrangementId;
            return (
              <div
                key={arr.id}
                className={`flex items-center justify-between rounded-lg border p-2.5 text-sm transition-colors cursor-pointer ${
                  isActive
                    ? "border-vc-indigo/30 bg-vc-indigo/5"
                    : "border-vc-border-light hover:bg-vc-bg-warm"
                }`}
                onClick={() => onSelect(arr)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelect(arr);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-vc-text">
                      {arr.name}
                    </span>
                    {arr.is_default && (
                      <Badge variant="success">Default</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-vc-text-muted">
                    Key: {arr.key} &middot; {arr.chart_type}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {!arr.is_default && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetDefault(arr.id);
                      }}
                      className="rounded p-1 text-xs text-vc-text-muted hover:bg-vc-bg-warm hover:text-vc-indigo"
                      title="Set as default"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreate(arr.id);
                    }}
                    className="rounded p-1 text-xs text-vc-text-muted hover:bg-vc-bg-warm hover:text-vc-indigo"
                    title="Clone"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                    </svg>
                  </button>
                  {!arr.is_default && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(arr.id);
                      }}
                      className="rounded p-1 text-xs text-vc-text-muted hover:bg-vc-danger/10 hover:text-vc-danger"
                      title="Delete"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
