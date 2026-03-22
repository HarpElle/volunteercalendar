"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SongEditor } from "@/components/worship/song-editor";
import { ArrangementsPanel } from "@/components/worship/arrangements-panel";
import type { Song, SongArrangement } from "@/lib/types";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SongEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: songId } = use(params);
  const router = useRouter();
  const { user, profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeArrangementId, setActiveArrangementId] = useState<string | null>(null);

  // ---- Fetch song ----

  const loadSong = useCallback(async () => {
    if (!churchId || !user || !songId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/songs?church_id=${churchId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error("Failed to load song");
      const data = await res.json();
      const songs: Song[] = data.songs ?? data;
      const found = songs.find((s: Song) => s.id === songId);
      if (!found) throw new Error("Song not found");
      setSong(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [churchId, user, songId]);

  useEffect(() => {
    loadSong();
  }, [loadSong]);

  // ---- Save handler ----

  const handleSave = useCallback(async (updates: Partial<Song>) => {
    if (!user || !churchId || !songId) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      // Use a PATCH-like approach via the songs API
      // For now, save via the existing POST endpoint pattern
      // TODO: Add PATCH /api/songs/[id] route
      const res = await fetch(`/api/songs/${songId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          ...updates,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSong((prev) => prev ? { ...prev, ...updated } : prev);
      }
    } catch {
      // Silently fail on auto-save — user can retry
    } finally {
      setSaving(false);
    }
  }, [user, churchId, songId]);

  // ---- Arrangement selection ----

  function handleSelectArrangement(arrangement: SongArrangement) {
    setActiveArrangementId(arrangement.id);
    // Load arrangement's chart data into the editor
    if (song) {
      setSong({
        ...song,
        chart_data: arrangement.chart_data,
        default_key: arrangement.key,
      });
    }
  }

  // ---- Loading / Error ----

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-vc-bg">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !song) {
    return (
      <div className="min-h-screen bg-vc-bg px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-vc-danger/20 bg-vc-danger/5 p-8 text-center">
          <p className="text-vc-danger">{error || "Song not found"}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/dashboard/worship/songs")}
          >
            Back to Song Library
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-vc-bg px-4 py-6 sm:px-6 lg:px-8">
      {/* Back + actions */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => router.push(`/dashboard/worship/songs/${songId}`)}
          className="flex items-center gap-1 text-sm text-vc-text-secondary hover:text-vc-indigo"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back to Song
        </button>
        <h1 className="font-display text-xl font-bold text-vc-indigo">
          Edit: {song.title}
        </h1>
      </div>

      {/* Two-column layout: arrangements sidebar + editor */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Arrangements sidebar */}
        {churchId && (
          <div className="w-full rounded-xl bg-white p-4 shadow-sm lg:w-72 lg:shrink-0">
            <ArrangementsPanel
              songId={songId}
              churchId={churchId}
              activeArrangementId={activeArrangementId}
              onSelect={handleSelectArrangement}
            />
          </div>
        )}

        {/* Editor */}
        <div className="min-w-0 flex-1">
          <SongEditor song={song} onSave={handleSave} saving={saving} />
        </div>
      </div>
    </div>
  );
}
