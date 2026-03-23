"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ChordChartViewer } from "@/components/worship/chord-chart-viewer";
import { PdfChartViewer } from "@/components/worship/pdf-chart-viewer";
import type { Song } from "@/lib/types";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SongDetailPage({
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
  const [error, setError] = useState<string | null>(null);
  const [selectedPdfKey, setSelectedPdfKey] = useState<string | null>(null);

  // ---- Fetch song ----

  const loadSong = useCallback(async () => {
    if (!churchId || !user || !songId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/songs?church_id=${churchId}&search=`,
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

  // ---- Loading ----

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
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={() => router.push("/dashboard/worship/songs")}
          className="flex items-center gap-1 text-sm text-vc-text-secondary hover:text-vc-indigo"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back to Song Library
        </button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            Re-import
          </Button>
          <Button size="sm" onClick={() => router.push(`/dashboard/worship/songs/${songId}/edit`)}>
            Edit Song
          </Button>
        </div>
      </div>

      {/* Song metadata header */}
      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h1 className="font-display text-3xl font-bold text-vc-indigo">
          {song.title}
        </h1>
        {(song.writer_credit || song.artist_credit) && (
          <p className="mt-1 text-base text-vc-text-secondary">
            {song.writer_credit || song.artist_credit}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {song.default_key && <Badge variant="accent">Key: {song.default_key}</Badge>}
          {song.tempo && <Badge variant="default">{song.tempo} BPM</Badge>}
          {song.time_signature && <Badge variant="default">{song.time_signature}</Badge>}
          {song.ccli_number && <Badge variant="default">CCLI #{song.ccli_number}</Badge>}
          <Badge variant={song.status === "active" ? "success" : "default"}>
            {song.in_rotation ? "In Rotation" : song.status}
          </Badge>
          {song.original_file_type === "pdf" && (
            <Badge variant="default">
              <svg className="mr-1 inline h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              PDF Chart
            </Badge>
          )}
          {song.original_file_type === "chordpro" && song.chart_data && (
            <Badge variant="accent">
              <svg className="mr-1 inline h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
              </svg>
              ChordPro
            </Badge>
          )}
        </div>

        {song.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {song.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        )}

        {song.copyright && (
          <p className="mt-3 text-xs text-vc-text-muted">{song.copyright}</p>
        )}
      </div>

      {/* Chart viewer — PDF native display, ChordPro interactive viewer, or lyrics fallback */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        {song.original_file_type === "pdf" && song.original_file_url && churchId ? (
          <>
            {song.available_keys.length > 1 && (
              <div className="mb-4 flex items-center gap-2">
                <span className="text-sm font-medium text-vc-text-secondary">Key:</span>
                <div className="flex flex-wrap gap-1.5">
                  {song.available_keys.map((k) => (
                    <button
                      key={k}
                      onClick={() => setSelectedPdfKey(k === song.default_key ? null : k)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        (selectedPdfKey || song.default_key) === k
                          ? "bg-vc-indigo text-white"
                          : "bg-vc-bg-warm text-vc-text-secondary hover:bg-vc-sand/30"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <PdfChartViewer songId={songId} churchId={churchId} selectedKey={selectedPdfKey} />

            {/* Legacy: show AI-extracted chart if it exists from a previous import */}
            {song.chart_data && song.chart_data.sections.length > 0 && (
              <LegacyChartSection
                song={song}
                songId={songId}
                churchId={churchId}
                onDiscard={() => setSong((s) => s ? { ...s, chart_data: { ...s.chart_data!, sections: [] } } : s)}
              />
            )}
          </>
        ) : song.chart_data && song.chart_data.sections.length > 0 ? (
          <ChordChartViewer
            chartData={song.chart_data}
            title={song.title}
            writers={song.writer_credit}
            copyright={song.copyright}
            ccliNumber={song.ccli_number}
          />
        ) : song.lyrics ? (
          <div>
            <h2 className="mb-3 font-display text-lg font-semibold text-vc-indigo">Lyrics</h2>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-vc-text">
              {song.lyrics}
            </pre>
          </div>
        ) : (
          <div className="py-12 text-center">
            <svg className="mx-auto h-12 w-12 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
            </svg>
            <h3 className="mt-3 text-base font-semibold text-vc-indigo">
              No chord chart or lyrics
            </h3>
            <p className="mt-1 text-sm text-vc-text-secondary">
              Import a ChordPro or PDF file to add a chord chart to this song.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legacy AI-extracted chart — collapsible section for PDF songs that still
// have chart_data.sections from a previous AI import
// ---------------------------------------------------------------------------

function LegacyChartSection({
  song,
  songId,
  churchId,
  onDiscard,
}: {
  song: Song;
  songId: string;
  churchId: string;
  onDiscard: () => void;
}) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  async function handleDiscard() {
    if (!user || !song.chart_data) return;
    setDiscarding(true);
    try {
      const token = await user.getIdToken();
      await fetch(`/api/songs/${songId}?church_id=${churchId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          chart_data: { metadata: song.chart_data.metadata, sections: [] },
        }),
      });
      onDiscard();
    } catch {
      // Silently fail — not critical
    } finally {
      setDiscarding(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-vc-sand/40 bg-vc-bg-warm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm"
      >
        <span className="font-medium text-vc-text-secondary">Legacy AI-Extracted Chart</span>
        <svg
          className={`h-4 w-4 text-vc-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-vc-sand/40 px-4 py-4">
          <ChordChartViewer
            chartData={song.chart_data!}
            title={song.title}
            writers={song.writer_credit}
            copyright={song.copyright}
            ccliNumber={song.ccli_number}
          />
          <div className="mt-4 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDiscard}
              disabled={discarding}
            >
              {discarding ? "Discarding..." : "Discard AI Chart"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
