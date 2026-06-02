"use client";

/**
 * Wave 12 A — Open Swaps section.
 *
 * Renders at the top of /dashboard/my-schedule for teammates to
 * discover open swap requests from their ministry mates. Tap [Cover]
 * → PATCH /api/swap?action=accept → assignment transfers to the
 * caller. Section auto-hides when no open swaps to cover.
 *
 * Notification deep-link from the team-broadcast notification points
 * at #open-swaps; we add the anchor id on the outer container so
 * iOS Safari scrolls to it after navigating.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import type { SwapRequest } from "@/lib/types";

interface OpenSwapsSectionProps {
  churchId: string;
  onAccepted: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function OpenSwapsSection({ churchId, onAccepted }: OpenSwapsSectionProps) {
  const { user, profile, activeMembership } = useAuth();
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolved from auth context — no extra fetch needed.
  // activeMembership.volunteer_id is the caller's Person ID in this church;
  // profile.display_name is the human-readable label for the swap log.
  const myVolunteerId = activeMembership?.volunteer_id ?? null;
  const myDisplayName = profile?.display_name ?? "Volunteer";

  const fetchSwaps = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/swap?church_id=${encodeURIComponent(churchId)}&open_for_me=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        setSwaps([]);
        return;
      }
      const data = (await res.json()) as { swaps: SwapRequest[] };
      setSwaps(data.swaps ?? []);
    } catch {
      setError("Couldn't load open swap requests");
    } finally {
      setLoading(false);
    }
  }, [user, churchId]);

  useEffect(() => {
    void fetchSwaps();
  }, [fetchSwaps]);

  const handleAccept = useCallback(
    async (swap: SwapRequest) => {
      if (!user || !myVolunteerId) return;
      if (
        !window.confirm(
          `Cover ${swap.requester_name}'s ${swap.role_title} on ${formatDate(swap.service_date)}?`,
        )
      ) {
        return;
      }
      setAcceptingId(swap.id);
      setError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/swap", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            church_id: churchId,
            swap_id: swap.id,
            action: "accept",
            volunteer_id: myVolunteerId,
            volunteer_name: myDisplayName,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? "Couldn't accept the swap");
        }
        onAccepted();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      } finally {
        setAcceptingId(null);
      }
    },
    [user, myVolunteerId, myDisplayName, churchId, onAccepted],
  );

  if (loading || swaps.length === 0) {
    // Hide the section when there's nothing to cover — avoids empty
    // space and keeps the page focused on the volunteer's own
    // schedule when nobody on their team needs a sub.
    return null;
  }

  return (
    <section
      id="open-swaps"
      className="mb-6 rounded-2xl border border-vc-coral/30 bg-vc-coral/5 p-5"
    >
      <header className="mb-3 flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="font-display text-lg text-vc-indigo">
          Sub needed on your team
        </h2>
        <span className="text-xs text-vc-text-muted">
          {swaps.length} open
        </span>
      </header>
      <ul className="space-y-3">
        {swaps.map((swap) => (
          <li
            key={swap.id}
            className="rounded-xl bg-white border border-vc-border-light p-3 flex items-start justify-between gap-3 flex-wrap"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-vc-indigo">
                {swap.role_title}
              </p>
              <p className="text-sm text-vc-text-secondary">
                {formatDate(swap.service_date)} · Requested by {swap.requester_name}
              </p>
              {swap.reason && (
                <p className="text-sm text-vc-text-muted mt-1 italic">
                  &ldquo;{swap.reason}&rdquo;
                </p>
              )}
            </div>
            <Button
              onClick={() => handleAccept(swap)}
              loading={acceptingId === swap.id}
              disabled={!myVolunteerId}
              className="shrink-0"
            >
              Cover this
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <p
          role="alert"
          className="text-sm text-vc-danger bg-vc-danger/5 border border-vc-danger/20 rounded-lg p-2 mt-3"
        >
          {error}
        </p>
      )}
    </section>
  );
}
