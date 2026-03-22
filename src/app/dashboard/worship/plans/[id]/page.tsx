"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import { StageSyncShareModal } from "@/components/worship/stage-sync-share-modal";
import type {
  ServicePlan,
  ServicePlanItem,
  ServicePlanItemType,
  Song,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ITEM_TYPES: { value: ServicePlanItemType; label: string }[] = [
  { value: "header", label: "Header" },
  { value: "song", label: "Song" },
  { value: "prayer", label: "Prayer" },
  { value: "sermon", label: "Sermon" },
  { value: "announcement", label: "Announcement" },
  { value: "offering", label: "Offering" },
  { value: "video", label: "Video" },
  { value: "custom", label: "Custom" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typeLabel(t: ServicePlanItemType): string {
  return ITEM_TYPES.find((i) => i.value === t)?.label ?? t;
}

function typeBadgeVariant(
  t: ServicePlanItemType,
): "default" | "primary" | "success" | "warning" | "accent" {
  switch (t) {
    case "song":
      return "primary";
    case "sermon":
      return "accent";
    case "prayer":
      return "success";
    case "header":
      return "default";
    default:
      return "warning";
  }
}

function generateItemId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlanEditorPage() {
  const router = useRouter();
  const rawParams = useParams();
  const planId = rawParams.id as string;
  const { user, profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [plan, setPlan] = useState<ServicePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [items, setItems] = useState<ServicePlanItem[]>([]);
  const [theme, setTheme] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [scriptureRefs, setScriptureRefs] = useState("");
  const [planNotes, setPlanNotes] = useState("");

  // UI state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [stageSyncOpen, setStageSyncOpen] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);

  // Song picker state
  const [songs, setSongs] = useState<Song[]>([]);
  const [songsLoaded, setSongsLoaded] = useState(false);

  // Debounced auto-save
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestItems = useRef(items);
  latestItems.current = items;

  // ---- Fetch plan ----

  useEffect(() => {
    if (!user || !churchId || !planId) return;

    let cancelled = false;
    async function fetchPlan() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch(
          `/api/service-plans/${planId}?church_id=${encodeURIComponent(churchId!)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`Failed to load plan (${res.status})`);
        const json = await res.json();
        const p = json.plan as ServicePlan;
        if (!cancelled) {
          setPlan(p);
          setItems(p.items || []);
          setTheme(p.theme || "");
          setSpeaker(p.speaker || "");
          setScriptureRefs((p.scripture_references || []).join(", "));
          setPlanNotes(p.notes || "");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchPlan();
    return () => {
      cancelled = true;
    };
  }, [user, churchId, planId]);

  // ---- Fetch songs (lazy, when add modal opens) ----

  const loadSongs = useCallback(async () => {
    if (songsLoaded || !user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/songs?church_id=${encodeURIComponent(churchId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setSongs(json.songs || []);
      }
    } catch {
      // silent
    } finally {
      setSongsLoaded(true);
    }
  }, [user, churchId, songsLoaded]);

  // ---- Save helpers ----

  const save = useCallback(
    async (updatedItems?: ServicePlanItem[]) => {
      if (!user || !churchId || !plan) return;
      setSaving(true);
      try {
        const token = await user.getIdToken();
        const refs = scriptureRefs
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        await fetch(`/api/service-plans/${planId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            church_id: churchId,
            items: updatedItems ?? latestItems.current,
            theme: theme || null,
            speaker: speaker || null,
            scripture_references: refs,
            notes: planNotes || null,
          }),
        });
      } catch {
        // silent
      } finally {
        setSaving(false);
      }
    },
    [user, churchId, plan, planId, theme, speaker, scriptureRefs, planNotes],
  );

  function scheduleSave(updatedItems?: ServicePlanItem[]) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => save(updatedItems), 1200);
  }

  // ---- Item mutations ----

  function updateItems(next: ServicePlanItem[]) {
    // Re-sequence
    const sequenced = next.map((item, i) => ({ ...item, sequence: i }));
    setItems(sequenced);
    scheduleSave(sequenced);
  }

  function moveItem(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const copy = [...items];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    updateItems(copy);
  }

  function removeItem(id: string) {
    updateItems(items.filter((i) => i.id !== id));
  }

  function updateItemField(
    id: string,
    field: keyof ServicePlanItem,
    value: unknown,
  ) {
    updateItems(
      items.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    );
  }

  function toggleNotes(id: string) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ---- Publish ----

  async function handlePublish() {
    if (!user || !churchId) return;
    setPublishLoading(true);
    try {
      // Save first
      await save();
      const token = await user.getIdToken();
      const res = await fetch(`/api/service-plans/${planId}/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ church_id: churchId }),
      });
      if (res.ok) {
        setPlan((prev) =>
          prev
            ? { ...prev, published: true, published_at: new Date().toISOString() }
            : prev,
        );
      }
    } catch {
      // silent
    } finally {
      setPublishLoading(false);
    }
  }

  // ---- Derived ----

  const isPublished = plan?.published ?? false;
  const songMap = useMemo(() => {
    const m = new Map<string, Song>();
    for (const s of songs) m.set(s.id, s);
    return m;
  }, [songs]);

  const totalDuration = useMemo(
    () =>
      items.reduce((sum, i) => sum + (i.duration_minutes ?? 0), 0),
    [items],
  );

  // ---- Render ----

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="px-4 py-20 text-center">
        <p className="text-vc-danger">{error || "Plan not found"}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/dashboard/worship/plans")}
        >
          Back to Plans
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-vc-bg px-4 py-6 sm:px-6 lg:px-8">
      {/* Top bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.push("/dashboard/worship/plans")}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-gray-200 p-2 transition-colors hover:bg-gray-50"
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
        </button>

        <div className="flex-1">
          <h1 className="font-display text-2xl text-vc-indigo">
            {new Date(plan.service_date).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            {isPublished ? (
              <Badge variant="success">Published</Badge>
            ) : (
              <Badge variant="warning">Draft</Badge>
            )}
            <span className="text-xs text-vc-text-muted">
              {items.length} {items.length === 1 ? "item" : "items"}
              {totalDuration > 0 && ` · ${totalDuration} min`}
            </span>
            {saving && (
              <span className="text-xs text-vc-text-muted italic">
                Saving...
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPublished && items.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStageSyncOpen(true)}
            >
              Stage Sync
            </Button>
          )}
          {!isPublished && (
            <Button
              size="sm"
              loading={publishLoading}
              onClick={handlePublish}
              disabled={items.length === 0}
            >
              Publish
            </Button>
          )}
        </div>
      </div>

      {/* Metadata section */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
              Theme
            </label>
            <input
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value);
                scheduleSave();
              }}
              disabled={isPublished}
              placeholder="e.g. Grace Under Pressure"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-vc-coral disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
              Speaker
            </label>
            <input
              value={speaker}
              onChange={(e) => {
                setSpeaker(e.target.value);
                scheduleSave();
              }}
              disabled={isPublished}
              placeholder="e.g. Pastor John"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-vc-coral disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
              Scripture References
            </label>
            <input
              value={scriptureRefs}
              onChange={(e) => {
                setScriptureRefs(e.target.value);
                scheduleSave();
              }}
              disabled={isPublished}
              placeholder="e.g. Romans 8:28, John 3:16"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-vc-coral disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
              Plan Notes
            </label>
            <input
              value={planNotes}
              onChange={(e) => {
                setPlanNotes(e.target.value);
                scheduleSave();
              }}
              disabled={isPublished}
              placeholder="Internal notes for this plan"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-vc-coral disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
        </div>
      </div>

      {/* Items list */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="font-display text-lg text-vc-indigo">
            Order of Service
          </h2>
          {!isPublished && (
            <Button
              size="sm"
              onClick={() => {
                setAddModalOpen(true);
                loadSongs();
              }}
            >
              Add Item
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-vc-text-secondary">
              No items yet. Add your first item to build the order of service.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {items.map((item, idx) => {
              const isHeader = item.type === "header";
              const isExpanded = expandedNotes.has(item.id);
              const isEditing = editingItemId === item.id;
              const song = item.song_id ? songMap.get(item.song_id) : null;

              return (
                <div
                  key={item.id}
                  className={`group ${isHeader ? "bg-vc-bg-warm" : ""}`}
                >
                  {/* Main row */}
                  <div className="flex items-center gap-2 px-4 py-3">
                    {/* Reorder buttons */}
                    {!isPublished && (
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => moveItem(idx, -1)}
                          disabled={idx === 0}
                          className="flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:text-vc-indigo disabled:opacity-30"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                          </svg>
                        </button>
                        <button
                          onClick={() => moveItem(idx, 1)}
                          disabled={idx === items.length - 1}
                          className="flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:text-vc-indigo disabled:opacity-30"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Sequence number */}
                    {!isHeader && (
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
                        {idx + 1}
                      </span>
                    )}

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      {isHeader ? (
                        <p className="font-display text-base font-semibold tracking-wide text-vc-indigo uppercase">
                          {item.title || "Section Header"}
                        </p>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant={typeBadgeVariant(item.type)}>
                            {typeLabel(item.type)}
                          </Badge>
                          <span className="truncate text-sm font-medium text-vc-text">
                            {item.title ||
                              (song ? song.title : typeLabel(item.type))}
                          </span>
                          {item.key && (
                            <span className="flex-shrink-0 text-xs text-vc-text-muted">
                              Key: {item.key}
                            </span>
                          )}
                        </div>
                      )}
                      {!isHeader && item.duration_minutes != null && item.duration_minutes > 0 && (
                        <p className="mt-0.5 text-xs text-vc-text-muted">
                          {item.duration_minutes} min
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {/* Toggle notes */}
                      <button
                        onClick={() => toggleNotes(item.id)}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                          isExpanded || item.notes
                            ? "text-vc-coral"
                            : "text-gray-300 hover:text-vc-text-secondary"
                        }`}
                        title={isExpanded ? "Hide notes" : "Show notes"}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                        </svg>
                      </button>

                      {/* Edit item */}
                      {!isPublished && (
                        <button
                          onClick={() =>
                            setEditingItemId(isEditing ? null : item.id)
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 transition-colors hover:text-vc-text-secondary"
                          title="Edit"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                          </svg>
                        </button>
                      )}

                      {/* Remove */}
                      {!isPublished && (
                        <button
                          onClick={() => removeItem(item.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 transition-colors hover:text-vc-danger"
                          title="Remove"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline notes (collapsible) */}
                  {isExpanded && (
                    <div className="border-t border-gray-50 bg-gray-50/50 px-4 py-2">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-vc-text-muted">
                        Notes
                      </label>
                      <textarea
                        value={item.notes || ""}
                        onChange={(e) =>
                          updateItemField(item.id, "notes", e.target.value || null)
                        }
                        disabled={isPublished}
                        placeholder="Add a note for this item..."
                        rows={2}
                        className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-vc-coral disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </div>
                  )}

                  {/* Inline edit panel */}
                  {isEditing && !isPublished && (
                    <div className="border-t border-gray-100 bg-vc-bg px-4 py-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
                            Title
                          </label>
                          <input
                            value={item.title || ""}
                            onChange={(e) =>
                              updateItemField(
                                item.id,
                                "title",
                                e.target.value || null,
                              )
                            }
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-vc-coral"
                          />
                        </div>
                        {!isHeader && (
                          <>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
                                Duration (min)
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={item.duration_minutes ?? ""}
                                onChange={(e) =>
                                  updateItemField(
                                    item.id,
                                    "duration_minutes",
                                    e.target.value
                                      ? parseInt(e.target.value, 10)
                                      : null,
                                  )
                                }
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-vc-coral"
                              />
                            </div>
                            {item.type === "song" && (
                              <div>
                                <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
                                  Key
                                </label>
                                <input
                                  value={item.key || ""}
                                  onChange={(e) =>
                                    updateItemField(
                                      item.id,
                                      "key",
                                      e.target.value || null,
                                    )
                                  }
                                  placeholder="e.g. G"
                                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-vc-coral"
                                />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <div className="mt-2 flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingItemId(null)}
                        >
                          Done
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      <AddItemModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        songs={songs}
        onAdd={(newItem) => {
          updateItems([...items, newItem]);
          setAddModalOpen(false);
        }}
      />

      {/* Stage Sync share modal */}
      {stageSyncOpen && churchId && (
        <StageSyncShareModal
          open
          onClose={() => setStageSyncOpen(false)}
          churchId={churchId}
          planId={planId}
          planTitle={plan.theme || undefined}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Item Modal
// ---------------------------------------------------------------------------

function AddItemModal({
  open,
  onClose,
  songs,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  songs: Song[];
  onAdd: (item: ServicePlanItem) => void;
}) {
  const [type, setType] = useState<ServicePlanItemType>("song");
  const [title, setTitle] = useState("");
  const [selectedSongId, setSelectedSongId] = useState("");
  const [duration, setDuration] = useState("");
  const [key, setKey] = useState("");

  const { user } = useAuth();

  function handleAdd() {
    const song = songs.find((s) => s.id === selectedSongId);
    const now = new Date().toISOString();

    const item: ServicePlanItem = {
      id: generateItemId(),
      sequence: 0,
      type,
      song_id: type === "song" && selectedSongId ? selectedSongId : null,
      key: type === "song" ? key || (song?.default_key ?? null) : null,
      arrangement_id: null,
      title:
        type === "song"
          ? title || song?.title || null
          : title || null,
      duration_minutes:
        type === "header" ? null : duration ? parseInt(duration, 10) : null,
      arrangement_notes: null,
      notes: null,
      include_in_program_notes: false,
      created_at: now,
      updated_by: user?.uid || "",
    };

    onAdd(item);
    // Reset
    setType("song");
    setTitle("");
    setSelectedSongId("");
    setDuration("");
    setKey("");
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Item">
      <div className="space-y-4">
        {/* Type picker */}
        <div>
          <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
            Type
          </label>
          <div className="flex flex-wrap gap-1.5">
            {ITEM_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => {
                  setType(t.value);
                  setSelectedSongId("");
                  setTitle("");
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors min-h-[44px] ${
                  type === t.value
                    ? "bg-vc-coral text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Song picker */}
        {type === "song" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
              Song
            </label>
            <select
              value={selectedSongId}
              onChange={(e) => {
                setSelectedSongId(e.target.value);
                const s = songs.find((song) => song.id === e.target.value);
                if (s) {
                  setTitle(s.title);
                  setKey(s.default_key || "");
                }
              }}
              className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-vc-coral"
            >
              <option value="">Select a song...</option>
              {songs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                  {s.artist_credit ? ` — ${s.artist_credit}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
            {type === "header" ? "Header Text" : "Title"}
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              type === "header"
                ? "e.g. WORSHIP, SERMON, RESPONSE"
                : type === "song"
                  ? "Override song title (optional)"
                  : "e.g. Opening Prayer"
            }
            className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-vc-coral"
          />
        </div>

        {/* Duration + Key (not for headers) */}
        {type !== "header" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
                Duration (min)
              </label>
              <input
                type="number"
                min={0}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="5"
                className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-vc-coral"
              />
            </div>
            {type === "song" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
                  Key
                </label>
                <input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="e.g. G"
                  className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-vc-coral"
                />
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={
              (type === "song" && !selectedSongId && !title) ||
              (type === "header" && !title) ||
              (type !== "song" && type !== "header" && !title)
            }
          >
            Add
          </Button>
        </div>
      </div>
    </Modal>
  );
}
