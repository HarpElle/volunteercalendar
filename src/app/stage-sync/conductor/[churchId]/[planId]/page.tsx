"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { StageSyncConductor } from "@/components/worship/stage-sync-conductor";
import { Spinner } from "@/components/ui/spinner";

/**
 * Full-screen conductor page for Stage Sync.
 * Authenticated — only the conductor (scheduler/admin) can control the flow.
 */
export default function ConductorPage({
  params,
}: {
  params: Promise<{ churchId: string; planId: string }>;
}) {
  const { churchId, planId } = use(params);
  const { user, loading: authLoading } = useAuth();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    async function loadToken() {
      try {
        const idToken = await user!.getIdToken();
        const params = new URLSearchParams({
          church_id: churchId,
          plan_id: planId,
        });
        const res = await fetch(`/api/stage-sync/status?${params}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!res.ok) {
          throw new Error("Could not load Stage Sync status");
        }

        const data = await res.json();
        if (!data.enabled || !data.access_token) {
          throw new Error("Stage Sync is not enabled for this plan");
        }

        setAccessToken(data.access_token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }

    loadToken();
  }, [user, authLoading, churchId, planId]);

  if (authLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-vc-indigo">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !accessToken) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-vc-indigo p-8 text-center">
        <h1 className="font-display text-2xl text-white">Stage Sync</h1>
        <p className="mt-3 text-white/60">
          {error || "Stage Sync is not enabled for this plan."}
        </p>
      </div>
    );
  }

  return (
    <StageSyncConductor
      churchId={churchId}
      planId={planId}
      token={accessToken}
    />
  );
}
