"use client";

import { useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { SubscriptionTier } from "@/lib/types";

const TIER_OPTIONS: { value: SubscriptionTier; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "starter", label: "Starter" },
  { value: "growth", label: "Growth" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];

interface ApiResult {
  success?: boolean;
  error?: string;
  church_id?: string;
  tier?: string;
  source?: string;
}

export default function PlatformAdminPage() {
  const { user, loading } = useAuth();

  const [churchId, setChurchId] = useState("");
  const [tier, setTier] = useState<SubscriptionTier>("starter");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <p className="text-vc-text-secondary">Sign in to access this page.</p>
      </div>
    );
  }

  async function handleSetTier() {
    if (!churchId.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const token = await user!.getIdToken();
      const res = await fetch("/api/admin/tier-override", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ church_id: churchId.trim(), tier }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: "Network error — check your connection." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveOverride() {
    if (!churchId.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const token = await user!.getIdToken();
      const res = await fetch("/api/admin/tier-override", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId.trim(),
          remove_override: true,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: "Network error — check your connection." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">
          Platform Admin
        </h1>
        <p className="mt-1 text-vc-text-secondary">
          Superadmin tools — only authorized UIDs can execute actions.
        </p>
      </div>

      <section className="rounded-xl border border-vc-border-light bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-vc-indigo">
          Subscription Tier Override
        </h2>
        <p className="mb-6 text-sm text-vc-text-secondary">
          Set or remove a manual tier override for any organization. This
          bypasses Stripe billing.
        </p>

        <div className="space-y-4">
          <Input
            label="Church ID"
            placeholder="e.g. abc123def456"
            value={churchId}
            onChange={(e) => setChurchId(e.target.value)}
            required
          />

          <Select
            label="Tier"
            options={TIER_OPTIONS}
            value={tier}
            onChange={(e) => setTier(e.target.value as SubscriptionTier)}
          />

          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleSetTier}
              loading={submitting}
              disabled={!churchId.trim()}
            >
              Set Tier
            </Button>
            <Button
              variant="outline"
              onClick={handleRemoveOverride}
              loading={submitting}
              disabled={!churchId.trim()}
            >
              Remove Override
            </Button>
          </div>
        </div>

        {result && (
          <div
            className={`mt-6 rounded-lg p-4 text-sm ${
              result.success
                ? "border border-vc-sage/30 bg-vc-sage/10 text-vc-sage-dark"
                : "border border-vc-danger/30 bg-vc-danger/10 text-vc-danger"
            }`}
          >
            {result.success ? (
              <p>
                <span className="font-medium">Done.</span> Church{" "}
                <code className="rounded bg-white/60 px-1 py-0.5 text-xs">
                  {result.church_id}
                </code>{" "}
                → tier <strong>{result.tier}</strong> (source: {result.source})
              </p>
            ) : (
              <p>
                <span className="font-medium">Error:</span> {result.error}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
