"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import { SongSelectImportModal } from "@/components/worship/songselect-import-modal";
import type { Song } from "@/lib/types";

// ---------------------------------------------------------------------------
// Filter Tabs
// ---------------------------------------------------------------------------

type FilterTab = "all" | "in_rotation" | "archived";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in_rotation", label: "In Rotation" },
  { key: "archived", label: "Archived" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusBadgeVariant(
  status: Song["status"],
): "success" | "default" | "warning" {
  switch (status) {
    case "active":
      return "success";
    case "archived":
      return "default";
    case "retired":
      return "warning";
    default:
      return "default";
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SongsPage() {
  const router = useRouter();
  const { user, profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newKey, setNewKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ---- Fetch songs ----

  const loadSongs = useCallback(async () => {
    if (!churchId || !user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/songs?church_id=${churchId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load songs (${res.status})`);
      }
      const data = await res.json();
      setSongs(data.songs ?? data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [churchId, user]);

  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  // ---- Client-side filtering ----

  const filtered = useMemo(() => {
    let list = songs;

    // Tab filter
    if (activeTab === "in_rotation") {
      list = list.filter((s) => s.in_rotation && s.status === "active");
    } else if (activeTab === "archived") {
      list = list.filter((s) => s.status === "archived");
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q));
    }

    return list;
  }, [songs, activeTab, search]);

  // ---- Archive handler ----

  async function handleArchive(songId: string) {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/songs/${songId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          status: "archived",
          in_rotation: false,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to archive song");
        return;
      }
      setSongs((prev) =>
        prev.map((s) =>
          s.id === songId
            ? { ...s, status: "archived" as const, in_rotation: false }
            : s,
        ),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to archive song");
    }
  }

  // ---- Restore handler (Archived -> active) ----

  async function handleRestore(songId: string) {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/songs/${songId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ church_id: churchId, status: "active" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to restore song");
        return;
      }
      setSongs((prev) =>
        prev.map((s) =>
          s.id === songId ? { ...s, status: "active" as const } : s,
        ),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to restore song");
    }
  }

  // ---- Add Song handler ----

  async function handleCreateSong() {
    if (!user || !churchId || !newTitle.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/songs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          title: newTitle.trim(),
          default_key: newKey.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateError(data.error || `Failed to create song (${res.status})`);
        setCreating(false);
        return;
      }
      const data = await res.json();
      const song = data.song ?? data;
      setNewTitle("");
      setNewKey("");
      setAddModalOpen(false);
      router.push(`/dashboard/worship/songs/${song.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create song");
    } finally {
      setCreating(false);
    }
  }

  // ---- Render ----

  return (
    <div className="min-h-screen bg-vc-bg px-4 py-6 sm:px-6 lg:px-8">
      {/* Page header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">Song Library</h1>
          <p className="mt-1 text-vc-text-secondary">
            Manage your worship song catalog.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportModalOpen(true)}>
            Import Songs
          </Button>
          <Button onClick={() => setAddModalOpen(true)}>Add Song</Button>
        </div>
      </div>

      {/* SongSelect Import Modal */}
      <SongSelectImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImportComplete={loadSongs}
      />

      {/* Add Song Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => {
          setAddModalOpen(false);
          setCreateError(null);
        }}
        title="Add Song"
        subtitle="Create a song you can edit and add to service plans."
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-vc-indigo mb-1">
              Title <span className="text-vc-coral">*</span>
            </label>
            <Input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Amazing Grace"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTitle.trim() && !creating) {
                  handleCreateSong();
                }
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-vc-indigo mb-1">
              Default Key (optional)
            </label>
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="e.g. G, D, A"
            />
          </div>
          {createError && (
            <div className="rounded-lg border border-vc-danger/20 bg-vc-danger/5 p-3 text-sm text-vc-danger">
              {createError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setAddModalOpen(false);
                setCreateError(null);
              }}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateSong} disabled={creating || !newTitle.trim()}>
              {creating ? <Spinner size="sm" /> : "Create & Edit"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Search + filter tabs */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <Input
            placeholder="Search songs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search songs"
          />
        </div>

        <div className="flex gap-1 rounded-lg bg-vc-bg-warm p-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-[44px] min-w-[44px] rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-white text-vc-indigo shadow-sm"
                  : "text-vc-text-secondary hover:text-vc-text"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-lg border border-vc-danger/20 bg-vc-danger/5 p-4 text-center text-vc-danger">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-xl bg-vc-bg-warm p-12 text-center">
          <h2 className="font-display text-xl text-vc-indigo">
            {songs.length === 0
              ? "No songs yet"
              : "No songs match your filters"}
          </h2>
          <p className="mt-2 text-vc-text-secondary">
            {songs.length === 0
              ? "Add your first song to get started."
              : "Try adjusting your search or filter."}
          </p>
        </div>
      )}

      {/* Song table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-vc-border text-xs font-medium uppercase tracking-wider text-vc-text-secondary">
                <th className="px-4 py-3 sm:px-6">Title</th>
                <th className="hidden px-4 py-3 sm:table-cell sm:px-6">Key</th>
                <th className="hidden w-10 px-4 py-3 sm:table-cell sm:px-6" title="Chord Chart">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" /></svg>
                </th>
                <th className="hidden px-4 py-3 md:table-cell md:px-6">Tags</th>
                <th className="hidden px-4 py-3 lg:table-cell lg:px-6">
                  Last Used
                </th>
                <th className="px-4 py-3 sm:px-6">Status</th>
                <th className="px-4 py-3 sm:px-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vc-border/50">
              {filtered.map((song) => (
                <tr
                  key={song.id}
                  className="transition-colors hover:bg-vc-bg-warm/50"
                >
                  {/* Title — links to detail page */}
                  <td className="px-4 py-4 sm:px-6">
                    <Link
                      href={`/dashboard/worship/songs/${song.id}`}
                      className="font-medium text-vc-indigo hover:underline"
                    >
                      {song.title}
                    </Link>
                    {/* Show key + tags on mobile in a compact row */}
                    <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                      {song.default_key && (
                        <Badge variant="accent">{song.default_key}</Badge>
                      )}
                      {song.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag}>{tag}</Badge>
                      ))}
                    </div>
                  </td>

                  {/* Key */}
                  <td className="hidden px-4 py-4 sm:table-cell sm:px-6">
                    {song.default_key ? (
                      <span className="flex items-center gap-1">
                        <Badge variant="accent">{song.default_key}</Badge>
                        {song.available_keys.length > 1 && (
                          <span className="text-xs text-vc-text-muted">+{song.available_keys.length - 1}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-vc-text-muted">--</span>
                    )}
                  </td>

                  {/* Chart indicator */}
                  <td className="hidden px-4 py-4 sm:table-cell sm:px-6">
                    {song.original_file_type === "pdf" ? (
                      <span title="PDF Chart (view-only)">
                        <svg className="h-4 w-4 text-vc-indigo" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                      </span>
                    ) : song.chart_data && song.chart_data.sections?.length > 0 ? (
                      <span title="ChordPro (transposable)">
                        <svg className="h-4 w-4 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
                        </svg>
                      </span>
                    ) : (
                      <span className="text-vc-text-muted">--</span>
                    )}
                  </td>

                  {/* Tags */}
                  <td className="hidden px-4 py-4 md:table-cell md:px-6">
                    <div className="flex flex-wrap gap-1">
                      {song.tags.length > 0 ? (
                        song.tags.map((tag) => (
                          <Badge key={tag}>{tag}</Badge>
                        ))
                      ) : (
                        <span className="text-vc-text-muted">--</span>
                      )}
                    </div>
                  </td>

                  {/* Last Used */}
                  <td className="hidden px-4 py-4 text-vc-text-secondary lg:table-cell lg:px-6">
                    {formatDate(song.last_used_date)}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-4 sm:px-6">
                    <Badge variant={statusBadgeVariant(song.status)}>
                      {song.in_rotation ? "In Rotation" : song.status}
                    </Badge>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-4 sm:px-6">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-[44px] min-w-[44px]"
                        onClick={() =>
                          router.push(`/dashboard/worship/songs/${song.id}`)
                        }
                      >
                        Edit
                      </Button>
                      {song.status === "archived" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-[44px] min-w-[44px] text-vc-sage"
                          onClick={() => handleRestore(song.id)}
                        >
                          Restore
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-[44px] min-w-[44px] text-vc-text-secondary"
                          onClick={() => handleArchive(song.id)}
                        >
                          Archive
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
