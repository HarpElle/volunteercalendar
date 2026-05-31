"use client";

/**
 * <BlockedPickupReview> — Wave 9 P0-2 sub-PR F.
 *
 * Full-screen kiosk modal shown to the staffed-station operator
 * BEFORE releasing a child. Lists every block-list entry that applies
 * to the children behind the entered security code, with photos +
 * names + reason badges.
 *
 * Two CTAs:
 *   - "Not on this list — proceed"  → onConfirmNotOnList()
 *   - "Person IS on this list"      → onAttempt(blockedPickupId)
 *
 * The "is on list" path requires the operator to TAP THE SPECIFIC
 * ENTRY first (so the audit metadata records which person was
 * matched). After the operator taps an entry, the alert button
 * becomes active.
 *
 * Photos render via the kiosk-side signed-URL endpoint. The kiosk
 * already authenticates via the X-Kiosk-Token header, so this
 * component fetches signed URLs through the kioskFetch helper.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  KIOSK_TOKEN_KEY,
} from "@/lib/kiosk-client";
import type { BlockedPickup } from "@/lib/types";

interface BlockedPickupReviewProps {
  blocks: BlockedPickup[];
  childPreview: { child_name: string; room_name?: string | null }[];
  onConfirmNotOnList: () => void;
  onAttempt: (blockedPickupId: string) => void;
  onCancel: () => void;
  submitting?: boolean;
}

const REASON_LABELS: Record<BlockedPickup["reason"], string> = {
  court_order: "Court order",
  household_decision: "Household decision",
  other: "Other",
};

export function BlockedPickupReview({
  blocks,
  childPreview,
  onConfirmNotOnList,
  onAttempt,
  onCancel,
  submitting = false,
}: BlockedPickupReviewProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Block list review — required before release"
    >
      <div className="bg-vc-bg rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="border-b-2 border-vc-danger bg-vc-danger/10 px-6 py-4">
          <h2 className="text-2xl font-display font-bold text-vc-danger">
            Block list — please review before release
          </h2>
          <p className="text-sm text-vc-text-secondary mt-1">
            One or more entries on this household&rsquo;s block list. Confirm
            the on-site pickup person is NOT on the list before releasing
            {childPreview.length > 0
              ? ` ${childPreview.map((c) => c.child_name).join(", ")}`
              : ""}
            .
          </p>
        </div>

        <ul className="px-6 py-4 space-y-3">
          {blocks.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setSelected(b.id)}
                className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border-2 transition-colors min-h-[88px] ${
                  selected === b.id
                    ? "border-vc-danger bg-vc-danger/10"
                    : "border-vc-border-light bg-white hover:border-vc-danger/40"
                }`}
                aria-pressed={selected === b.id}
              >
                <KioskBlockedThumbnail path={b.photo_url} alt={b.name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-display text-lg font-semibold text-vc-indigo">
                      {b.name}
                    </p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-vc-danger/10 text-vc-danger font-medium">
                      {REASON_LABELS[b.reason]}
                    </span>
                    {b.scope === "household" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-vc-indigo/10 text-vc-indigo/70">
                        Sibling-wide
                      </span>
                    )}
                  </div>
                  {b.phone && (
                    <p className="text-sm text-vc-text-secondary mt-1">
                      Phone: {b.phone}
                    </p>
                  )}
                  {b.notes && (
                    <p className="text-sm text-vc-text-secondary mt-1 italic">
                      {b.notes}
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>

        <div className="border-t border-vc-border-light px-6 py-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onConfirmNotOnList}
              disabled={submitting}
              className="flex-1 min-h-[64px] px-4 py-3 rounded-lg bg-vc-sage text-white font-display text-lg font-semibold hover:bg-vc-sage/90 disabled:opacity-50"
            >
              ✓ Not on this list — proceed
            </button>
            <button
              type="button"
              onClick={() => selected && onAttempt(selected)}
              disabled={!selected || submitting}
              className="flex-1 min-h-[64px] px-4 py-3 rounded-lg bg-vc-danger text-white font-display text-lg font-semibold hover:bg-vc-coral-dark disabled:opacity-50"
              aria-label="Person IS on this list — block release and alert owner"
            >
              ⚠ Person IS on this list
            </button>
          </div>
          <p className="text-xs text-vc-text-secondary text-center">
            To flag a blocked-pickup attempt, tap the matching entry above
            first, then tap the red button. SMS will fan out to the church
            owner and Emergency Response Team.
          </p>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="block mx-auto text-sm text-vc-text-secondary hover:text-vc-indigo min-h-[44px] px-3"
          >
            Cancel checkout
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Internal: render a kiosk-authenticated thumbnail. We can't reuse the
 * admin PhotoThumbnail because that uses the auth-context Bearer token.
 * Here we use the kiosk's X-Kiosk-Token via localStorage.
 */
function KioskBlockedThumbnail({
  path,
  alt,
}: {
  path: string | null;
  alt: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const inflight = useRef(false);

  const fetchUrl = useCallback(async () => {
    if (!path || inflight.current) return;
    inflight.current = true;
    try {
      const churchId =
        typeof window !== "undefined"
          ? window.localStorage.getItem("vc_kiosk_church_id")
          : null;
      const token =
        typeof window !== "undefined"
          ? window.localStorage.getItem(KIOSK_TOKEN_KEY)
          : null;
      if (!churchId || !token) {
        setError(true);
        return;
      }
      // Use the kiosk signed-URL helper — same shape as the admin one
      // but kiosk-scoped. Sub-PR F adds /api/checkin/photo for this.
      const res = await fetch(
        `/api/checkin/photo?church_id=${encodeURIComponent(churchId)}&path=${encodeURIComponent(path)}`,
        { headers: { "X-Kiosk-Token": token } },
      );
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as { signed_url: string };
      setUrl(data.signed_url);
    } catch {
      setError(true);
    } finally {
      inflight.current = false;
    }
  }, [path]);

  useEffect(() => {
    void fetchUrl();
  }, [fetchUrl]);

  if (!path) {
    return (
      <div className="w-20 h-20 flex-shrink-0 bg-vc-bg-warm border border-vc-border-light rounded-lg flex items-center justify-center text-xs text-vc-text-secondary">
        No photo
      </div>
    );
  }
  if (error) {
    return (
      <div className="w-20 h-20 flex-shrink-0 bg-vc-bg-warm border border-vc-border-light rounded-lg flex items-center justify-center text-xs text-vc-text-secondary">
        ⚠
      </div>
    );
  }
  if (!url) {
    return (
      <div className="w-20 h-20 flex-shrink-0 bg-vc-bg-warm border border-vc-border-light rounded-lg animate-pulse" />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className="w-20 h-20 flex-shrink-0 rounded-lg object-cover border border-vc-border-light"
    />
  );
}
