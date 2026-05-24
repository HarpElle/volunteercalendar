"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Pass G Phase 3: org-admin-only Security subsection.
 *
 * Currently hosts the bulk calendar-feed rotation action — invalidates
 * every outstanding iCal URL in one shot for incident response or
 * routine periodic rotation. More security knobs can be added here
 * later (token-revocation listing, audit log shortcut, etc.) without
 * a Settings tab change.
 */
export function SecuritySection({
  churchId,
  user,
}: {
  churchId: string;
  user: User | null;
}) {
  const [rotating, setRotating] = useState(false);
  const [result, setResult] = useState<{
    rotated: number;
    timestamp: string;
  } | null>(null);
  const [error, setError] = useState("");

  async function handleRegenerateAll() {
    if (!user) return;
    if (
      !confirm(
        "Regenerate ALL calendar feed URLs for this organization? Every existing iCal subscription stops working immediately and each user will need to re-subscribe. This is irreversible.\n\nUse for: suspected leak of feed URLs, or routine periodic rotation.",
      )
    ) {
      return;
    }
    setRotating(true);
    setResult(null);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/calendar-feeds/regenerate-all", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ church_id: churchId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to regenerate");
      }
      const data = await res.json();
      setResult({
        rotated: data.rotated as number,
        timestamp: new Date().toLocaleString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate");
    } finally {
      setRotating(false);
    }
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-vc-indigo">Security</h2>
      <div className="rounded-xl border border-vc-border-light bg-white p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-vc-indigo">
            Regenerate all calendar feed URLs
          </h3>
          <p className="mt-1 text-sm text-vc-text-secondary">
            Invalidates every iCal subscription URL in this organization in
            one shot. Each user must re-subscribe to their personal feed.
            Use for suspected leaks or routine periodic rotation. Revoked
            feeds are skipped (they're already disabled).
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            onClick={handleRegenerateAll}
            loading={rotating}
            className="border-vc-coral/30 text-vc-coral hover:bg-vc-coral/5"
          >
            Regenerate all calendar URLs
          </Button>
          {result && (
            <div className="flex items-center gap-2 text-sm text-vc-sage">
              <Badge variant="success">
                Rotated {result.rotated} {result.rotated === 1 ? "feed" : "feeds"}
              </Badge>
              <span className="text-xs text-vc-text-muted">
                at {result.timestamp}
              </span>
            </div>
          )}
          {error && (
            <p className="text-sm text-vc-danger">{error}</p>
          )}
        </div>

        <p className="text-xs text-vc-text-muted">
          Individual feed rotation + revocation lives on each user's Account
          page. This action rotates them all at once for incident response.
        </p>
      </div>
    </section>
  );
}
