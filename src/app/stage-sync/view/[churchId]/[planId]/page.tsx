"use client";

import { use, useEffect, useState } from "react";
import { StageSyncViewer } from "@/components/worship/stage-sync-viewer";
import { Spinner } from "@/components/ui/spinner";

/**
 * Full-screen participant page for Stage Sync.
 * Unauthenticated — the access token in the live Firestore document
 * acts as the authorization. Participants subscribe via onSnapshot.
 */
export default function ParticipantPage({
  params,
}: {
  params: Promise<{ churchId: string; planId: string }>;
}) {
  const { churchId, planId } = use(params);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch the access token from the plan (via a lightweight public endpoint
  // or by reading it from the URL). For now, we look up the plan's stage_sync
  // token via Firestore client-side query on stage_sync_live collection.
  useEffect(() => {
    async function findToken() {
      try {
        const { initializeApp, getApps } = await import("firebase/app");
        const { getFirestore, collection, query, where, getDocs } = await import(
          "firebase/firestore"
        );

        const config = {
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        };

        const app = getApps().length > 0 ? getApps()[0] : initializeApp(config);
        const db = getFirestore(app);

        // Find the live sync document for this church + plan
        const q = query(
          collection(db, "stage_sync_live"),
          where("church_id", "==", churchId),
          where("plan_id", "==", planId),
        );

        const snap = await getDocs(q);
        if (snap.empty) {
          throw new Error("No active Stage Sync session found for this plan.");
        }

        // The document ID is the access token
        setAccessToken(snap.docs[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect");
      } finally {
        setLoading(false);
      }
    }

    findToken();
  }, [churchId, planId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-vc-indigo">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-sm text-white/50">
            Connecting to Stage Sync...
          </p>
        </div>
      </div>
    );
  }

  if (error || !accessToken) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-vc-indigo p-8 text-center">
        <h1 className="font-display text-2xl text-white">Stage Sync</h1>
        <p className="mt-3 text-white/60">
          {error || "Stage Sync is not active for this plan."}
        </p>
      </div>
    );
  }

  return <StageSyncViewer accessToken={accessToken} />;
}
