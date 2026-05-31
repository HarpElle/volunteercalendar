"use client";

/**
 * <PhotoThumbnail> — Wave 9 P0-2 sub-PR D.
 *
 * Renders a check-in photo from its opaque storage path. Storage rules
 * deny direct client reads (foundation PR), so the component fetches a
 * short-TTL signed URL from `/api/admin/checkin/photo` and uses that
 * URL in the <img> tag.
 *
 * Each component instance maintains its own URL cache keyed by the
 * storage path. If the same path is reused across thumbnails on the
 * same page, each instance fetches its own URL — that's fine, the
 * read endpoint is cheap and the deduplication isn't worth the
 * context-provider weight at this scale. A future Sub-PR could
 * introduce a CheckInPhotoProvider with shared cache + dedup if N
 * thumbnails per page becomes painful.
 *
 * URLs are refreshed when the cached one is within 30 seconds of
 * expiry (proactive — avoids a broken thumbnail mid-render).
 */

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";

interface PhotoThumbnailProps {
  /** Storage path (e.g. churches/X/checkin-photos/authorized/Y.jpg). */
  path: string | null | undefined;
  /** Display alt text. */
  alt: string;
  /** Tailwind class for sizing — default is a 16×16 square. */
  className?: string;
  /** Override placeholder content when no path is provided. */
  placeholder?: React.ReactNode;
}

interface CachedUrl {
  signed_url: string;
  expires_at_ms: number;
}

const REFRESH_LEAD_MS = 30_000; // refresh 30s before expiry

export function PhotoThumbnail({
  path,
  alt,
  className = "w-16 h-16",
  placeholder,
}: PhotoThumbnailProps) {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;
  const [cached, setCached] = useState<CachedUrl | null>(null);
  const [error, setError] = useState(false);
  const inflight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!path || !user || !churchId) {
      setCached(null);
      return;
    }
    // Skip refetch if cached URL is still fresh.
    if (cached && cached.expires_at_ms - Date.now() > REFRESH_LEAD_MS) return;
    if (inflight.current) return;

    inflight.current = (async () => {
      try {
        const token = await user.getIdToken();
        const url = `/api/admin/checkin/photo?church_id=${encodeURIComponent(
          churchId,
        )}&path=${encodeURIComponent(path)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = (await res.json()) as {
          signed_url: string;
          expires_at: string;
        };
        setCached({
          signed_url: data.signed_url,
          expires_at_ms: Date.parse(data.expires_at),
        });
        setError(false);
      } catch {
        setError(true);
      } finally {
        inflight.current = null;
      }
    })();
  }, [path, user, churchId, cached]);

  if (!path) {
    return (
      <div
        className={`${className} bg-vc-bg-warm border border-vc-border-light rounded-lg flex items-center justify-center text-vc-text-secondary text-xs`}
        aria-label={`${alt} — no photo`}
      >
        {placeholder ?? "No photo"}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`${className} bg-vc-bg-warm border border-vc-border-light rounded-lg flex items-center justify-center text-vc-text-secondary text-xs`}
        aria-label={`${alt} — photo unavailable`}
      >
        ⚠ unavail
      </div>
    );
  }

  if (!cached) {
    return (
      <div
        className={`${className} bg-vc-bg-warm border border-vc-border-light rounded-lg animate-pulse`}
        aria-label={`${alt} — loading`}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cached.signed_url}
      alt={alt}
      className={`${className} rounded-lg object-cover border border-vc-border-light`}
    />
  );
}
