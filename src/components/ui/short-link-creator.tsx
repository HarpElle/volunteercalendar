"use client";

import { useState, useEffect, useRef } from "react";
import { getAuth } from "firebase/auth";

interface ShortLinkCreatorProps {
  churchId: string;
  targetUrl: string;
  label: string;
  /** Current subscription tier — used to gate access */
  tier?: string;
  /** Called when a short link is successfully created */
  onCreated?: (slug: string, expiresAt: string) => void;
  /** Called when the creator is dismissed */
  onClose: () => void;
}

/**
 * Inline short link creator with slug input, live availability check,
 * and expiry selector. Used in share menus for join links and event invites.
 */
export function ShortLinkCreator({
  churchId,
  targetUrl,
  label,
  tier,
  onCreated,
  onClose,
}: ShortLinkCreatorProps) {
  // Tier gate: free tier cannot create short links
  if (tier === "free") {
    return (
      <div className="space-y-3 rounded-xl border border-vc-border-light bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-vc-indigo">Short links</p>
          <button
            onClick={onClose}
            className="text-vc-text-muted hover:text-vc-indigo transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-vc-text-secondary">
          Short links are available on the <strong>Starter</strong> plan and above.
          Upgrade to create branded, trackable short links for your events and join pages.
        </p>
        <a
          href="/dashboard/organization"
          className="inline-flex items-center gap-1.5 rounded-lg bg-vc-coral px-3 py-2 text-sm font-medium text-white hover:bg-vc-coral/90 transition-colors"
        >
          View plans
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </a>
      </div>
    );
  }

  const [slug, setSlug] = useState("");
  const [expiryDays, setExpiryDays] = useState(30);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Live availability check with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const normalized = slug.toLowerCase().replace(/[^a-z0-9-]/g, "").trim();
    if (normalized.length < 3) {
      setAvailable(null);
      setReason("");
      return;
    }

    setChecking(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/short-links/check?slug=${encodeURIComponent(normalized)}`);
        const data = await res.json();
        setAvailable(data.available);
        setReason(data.available ? "" : data.reason || "Not available");
      } catch {
        setAvailable(null);
      } finally {
        setChecking(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [slug]);

  function normalizeSlug(val: string) {
    return val.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 50);
  }

  async function handleCreate() {
    const normalized = normalizeSlug(slug);
    if (normalized.length < 3 || !available) return;

    setCreating(true);
    setError("");

    try {
      const token = await getAuth().currentUser?.getIdToken();
      if (!token) {
        setError("Not authenticated");
        return;
      }

      const res = await fetch("/api/short-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          church_id: churchId,
          slug: normalized,
          target_url: targetUrl,
          label,
          expires_in_days: expiryDays,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create short link");
        return;
      }

      setSuccess(`volunteercal.com/s/${data.slug}`);
      onCreated?.(data.slug, data.expires_at);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-3 rounded-xl border border-vc-sage/30 bg-vc-sage/5 p-4">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          <p className="text-sm font-medium text-vc-sage">Short link created!</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={success}
            className="flex-1 rounded-lg border border-vc-sage/20 bg-white px-3 py-2 text-sm text-vc-indigo font-medium"
            onClick={(e) => {
              (e.target as HTMLInputElement).select();
              navigator.clipboard.writeText(success);
            }}
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(success);
            }}
            className="shrink-0 rounded-lg border border-vc-sage/30 px-3 py-2 text-xs font-medium text-vc-sage hover:bg-vc-sage/10 transition-colors"
          >
            Copy
          </button>
        </div>
        <div className="flex justify-between items-center">
          <p className="text-xs text-vc-text-muted">
            Active for {expiryDays} days
          </p>
          <button
            onClick={onClose}
            className="text-xs font-medium text-vc-text-secondary hover:text-vc-indigo transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  const normalized = normalizeSlug(slug);
  const isValid = normalized.length >= 3 && available === true;

  return (
    <div className="space-y-3 rounded-xl border border-vc-border-light bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-vc-indigo">Create short link</p>
        <button
          onClick={onClose}
          className="text-vc-text-muted hover:text-vc-indigo transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Slug input */}
      <div>
        <label className="text-xs font-medium text-vc-text-secondary">
          volunteercal.com/s/
        </label>
        <div className="relative mt-1">
          <input
            ref={inputRef}
            type="text"
            value={slug}
            onChange={(e) => setSlug(normalizeSlug(e.target.value))}
            placeholder="your-custom-slug"
            maxLength={50}
            className={`w-full rounded-lg border px-3 py-2 text-sm text-vc-text placeholder:text-vc-text-muted focus:outline-none focus:ring-2 transition-colors ${
              available === true
                ? "border-vc-sage/40 focus:border-vc-sage focus:ring-vc-sage/20"
                : available === false
                  ? "border-vc-danger/40 focus:border-vc-danger focus:ring-vc-danger/20"
                  : "border-vc-border focus:border-vc-coral focus:ring-vc-coral/20"
            }`}
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            {checking && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-vc-border border-t-vc-coral" />
            )}
            {!checking && available === true && (
              <svg className="h-4 w-4 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            )}
            {!checking && available === false && (
              <svg className="h-4 w-4 text-vc-danger" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            )}
          </div>
        </div>
        {available === false && reason && (
          <p className="mt-1 text-xs text-vc-danger">{reason}</p>
        )}
        {normalized.length > 0 && normalized.length < 3 && (
          <p className="mt-1 text-xs text-vc-text-muted">At least 3 characters</p>
        )}
      </div>

      {/* Expiry selector */}
      <div>
        <label className="text-xs font-medium text-vc-text-secondary">Active for</label>
        <div className="mt-1 flex gap-2">
          {[7, 14, 30, 60, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setExpiryDays(d)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                expiryDays === d
                  ? "bg-vc-indigo text-white"
                  : "bg-vc-bg-warm text-vc-text-secondary hover:bg-vc-indigo/10"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-vc-danger">{error}</p>}

      <button
        onClick={handleCreate}
        disabled={!isValid || creating}
        className="w-full rounded-lg bg-vc-coral px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-vc-coral/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {creating ? "Creating..." : "Create short link"}
      </button>
    </div>
  );
}
