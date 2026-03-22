"use client";

import { useState, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import { ChordChartRenderer } from "./chord-chart-renderer";
import type { SongChartData } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiveItem {
  id: string;
  type: string;
  title: string | null;
  song_id: string | null;
  key: string | null;
  arrangement_notes: string | null;
  chart_data: SongChartData | null;
}

interface LiveSyncData {
  current_item_index: number;
  current_item_id: string | null;
  items: LiveItem[];
  last_advanced_at: string | null;
}

interface StageSyncViewerProps {
  accessToken: string;
}

// ---------------------------------------------------------------------------
// Firebase Client Init (for real-time listener)
// ---------------------------------------------------------------------------

function getClientFirestore() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const app = getApps().length > 0 ? getApps()[0] : initializeApp(config);
  return getFirestore(app);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StageSyncViewer({ accessToken }: StageSyncViewerProps) {
  const [liveData, setLiveData] = useState<LiveSyncData | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disconnectedSince, setDisconnectedSince] = useState<number | null>(null);

  // ---- Real-time Firestore listener ----

  useEffect(() => {
    const db = getClientFirestore();
    const liveDocRef = doc(db, "stage_sync_live", accessToken);

    const unsubscribe = onSnapshot(
      liveDocRef,
      (snap) => {
        if (!snap.exists()) {
          setError("Stage Sync session not found or has ended.");
          setConnected(false);
          return;
        }

        const data = snap.data() as LiveSyncData;
        setLiveData(data);
        setConnected(true);
        setDisconnectedSince(null);
        setError(null);
      },
      (err) => {
        console.error("Stage Sync listener error:", err);
        setConnected(false);
        setDisconnectedSince(Date.now());
      },
    );

    return () => unsubscribe();
  }, [accessToken]);

  // ---- Disconnection timer ----

  useEffect(() => {
    if (!disconnectedSince) return;

    const timer = setInterval(() => {
      const elapsed = Date.now() - disconnectedSince;
      if (elapsed > 30_000) {
        setError("Connection lost. Waiting to reconnect...");
      }
    }, 5_000);

    return () => clearInterval(timer);
  }, [disconnectedSince]);

  // ---- Render ----

  if (error && !liveData) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-vc-indigo p-8 text-center">
        <h1 className="font-display text-2xl text-white">Stage Sync</h1>
        <p className="mt-3 text-white/60">{error}</p>
      </div>
    );
  }

  if (!liveData) {
    return (
      <div className="flex h-screen items-center justify-center bg-vc-indigo">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-sm text-white/50">Connecting to Stage Sync...</p>
        </div>
      </div>
    );
  }

  const currentIndex = liveData.current_item_index;
  const currentItem = liveData.items?.[currentIndex];

  function itemLabel(item: LiveItem | undefined) {
    if (!item) return "Waiting...";
    if (item.title) return item.title;
    if (item.type === "song") return "Song";
    return item.type.charAt(0).toUpperCase() + item.type.slice(1);
  }

  return (
    <div className="flex h-screen flex-col bg-vc-indigo text-white transition-all duration-500">
      {/* Connection status */}
      {!connected && (
        <div className="bg-vc-warning/80 px-4 py-2 text-center text-sm font-medium text-vc-indigo">
          Reconnecting...
        </div>
      )}

      {/* Current item */}
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        <p className="mb-3 text-sm font-medium uppercase tracking-wider text-vc-coral">
          {currentItem?.type ?? "—"}
        </p>
        <h1 className="text-center font-display text-5xl leading-tight text-white transition-all duration-500 sm:text-7xl">
          {itemLabel(currentItem)}
        </h1>
        {currentItem?.key && (
          <p className="mt-4 text-2xl text-white/60">Key: {currentItem.key}</p>
        )}
        {currentItem?.chart_data ? (
          <div className="mt-6 w-full max-w-3xl overflow-y-auto" style={{ maxHeight: "60vh" }}>
            <ChordChartRenderer
              chartData={currentItem.chart_data}
              stageSyncMode
              fontScale={1.2}
              chordHighlight
            />
          </div>
        ) : currentItem?.arrangement_notes ? (
          <p className="mt-6 max-w-2xl text-center text-lg leading-relaxed text-white/40">
            {currentItem.arrangement_notes}
          </p>
        ) : null}
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 pb-8">
        {liveData.items.map((item, i) => (
          <div
            key={item.id}
            className={`h-2.5 w-2.5 rounded-full transition-all duration-500 ${
              i === currentIndex
                ? "scale-125 bg-vc-coral"
                : i < currentIndex
                  ? "bg-white/30"
                  : "bg-white/10"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
