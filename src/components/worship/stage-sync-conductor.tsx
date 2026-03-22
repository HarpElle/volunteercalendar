"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ChordChartRenderer } from "./chord-chart-renderer";
import type { ServicePlanItem } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StageSyncConductorProps {
  churchId: string;
  planId: string;
  token: string;
}

interface SyncStatus {
  current_item_index: number;
  items: ServicePlanItem[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StageSyncConductor({
  churchId,
  planId,
  token,
}: StageSyncConductorProps) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Load current state ----

  const loadStatus = useCallback(async () => {
    try {
      const { getAuth } = await import("firebase/auth");
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) return;

      const params = new URLSearchParams({ church_id: churchId, plan_id: planId });
      const res = await fetch(`/api/stage-sync/status?${params}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!res.ok) throw new Error("Failed to load status");
      const data = await res.json();
      setStatus({
        current_item_index: data.current_item_index ?? 0,
        items: data.items ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [churchId, planId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // ---- Advance ----

  const advance = useCallback(
    async (targetIndex?: number) => {
      setAdvancing(true);
      setError(null);
      try {
        const { getAuth } = await import("firebase/auth");
        const auth = getAuth();
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;

        const res = await fetch("/api/stage-sync/advance", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            church_id: churchId,
            plan_id: planId,
            ...(typeof targetIndex === "number" ? { target_index: targetIndex } : {}),
          }),
        });

        if (!res.ok) throw new Error("Failed to advance");
        const data = await res.json();

        setStatus((prev) =>
          prev
            ? { ...prev, current_item_index: data.current_item_index }
            : prev,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Advance failed");
      } finally {
        setAdvancing(false);
      }
    },
    [churchId, planId],
  );

  // ---- Keyboard shortcuts ----

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        advance();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (status && status.current_item_index > 0) {
          advance(status.current_item_index - 1);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [advance, status]);

  // ---- Render ----

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-vc-indigo">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!status || status.items.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-vc-indigo p-8 text-center">
        <h1 className="font-display text-2xl text-white">No items in this plan</h1>
        <p className="mt-2 text-white/60">
          Add items to the service plan before starting Stage Sync.
        </p>
      </div>
    );
  }

  const currentIndex = status.current_item_index;
  const currentItem = status.items[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex >= status.items.length - 1;

  function itemLabel(item: ServicePlanItem) {
    if (item.title) return item.title;
    if (item.type === "song") return "Song";
    return item.type.charAt(0).toUpperCase() + item.type.slice(1);
  }

  return (
    <div className="flex h-screen flex-col bg-vc-indigo text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/50">
            Stage Sync — Conductor
          </p>
          <p className="text-sm text-white/70">
            {currentIndex + 1} of {status.items.length}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/50">
          <span>Token: {token.slice(0, 8)}...</span>
        </div>
      </div>

      {/* Current item display */}
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        <p className="mb-2 text-sm font-medium uppercase tracking-wider text-vc-coral">
          {currentItem?.type}
        </p>
        <h1 className="text-center font-display text-5xl leading-tight text-white sm:text-6xl">
          {itemLabel(currentItem)}
        </h1>
        {currentItem?.key && (
          <p className="mt-3 text-xl text-white/60">Key: {currentItem.key}</p>
        )}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- chart_data comes from resolved API response */}
        {(currentItem as any)?.chart_data ? (
          <div className="mt-4 w-full max-w-xl overflow-y-auto rounded-lg" style={{ maxHeight: "40vh" }}>
            <ChordChartRenderer
              chartData={(currentItem as any).chart_data}
              stageSyncMode
              fontScale={0.7}
              chordHighlight
            />
          </div>
        ) : currentItem?.arrangement_notes ? (
          <p className="mt-4 max-w-xl text-center text-sm leading-relaxed text-white/50">
            {currentItem.arrangement_notes}
          </p>
        ) : null}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mb-2 rounded-lg bg-vc-danger/20 px-4 py-2 text-center text-sm text-vc-danger">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between border-t border-white/10 px-6 py-5">
        <Button
          variant="outline"
          onClick={() => advance(currentIndex - 1)}
          disabled={isFirst || advancing}
          className="min-w-[120px] border-white/20 text-white hover:bg-white/10"
        >
          Previous
        </Button>

        {/* Item list (compact) */}
        <div className="hidden gap-1.5 sm:flex">
          {status.items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => advance(i)}
              className={`h-2.5 w-2.5 rounded-full transition-all ${
                i === currentIndex
                  ? "scale-125 bg-vc-coral"
                  : i < currentIndex
                    ? "bg-white/30"
                    : "bg-white/10"
              }`}
              title={itemLabel(item)}
            />
          ))}
        </div>

        <Button
          onClick={() => advance()}
          disabled={isLast || advancing}
          className="min-w-[120px] bg-vc-coral text-white hover:bg-vc-coral-dark"
        >
          {advancing ? <Spinner size="sm" /> : "Next"}
        </Button>
      </div>

      {/* Keyboard hint */}
      <p className="pb-3 text-center text-xs text-white/30">
        Space / Enter / Arrow keys to navigate
      </p>
    </div>
  );
}
