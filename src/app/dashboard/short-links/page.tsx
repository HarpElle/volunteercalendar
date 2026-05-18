"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { isAdmin } from "@/lib/utils/permissions";
import { TIER_LIMITS } from "@/lib/constants";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import type { Church } from "@/lib/types";

interface ShortLink {
  id: string;
  slug: string;
  target_url: string;
  label: string;
  created_by: string;
  created_at: string;
  expires_at: string;
}

export default function ShortLinksPage() {
  const { user: _user, profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [church, setChurch] = useState<Church | null>(null);
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expiring, setExpiring] = useState<string | null>(null);
  const [creatingTest, setCreatingTest] = useState(false);
  const [testCreateError, setTestCreateError] = useState<string | null>(null);
  const [testSlug, setTestSlug] = useState("");
  const [testLabel, setTestLabel] = useState("");
  const [testTarget, setTestTarget] = useState("/dashboard");
  const [testExpiryDays, setTestExpiryDays] = useState(30);

  useEffect(() => {
    if (!churchId) { setLoading(false); return; }
    async function load() {
      try {
        const [churchSnap] = await Promise.all([
          getDoc(doc(db, "churches", churchId!)),
        ]);
        if (churchSnap.exists()) {
          setChurch({ id: churchSnap.id, ...churchSnap.data() } as unknown as Church);
        }
        // Load short links
        const token = await getAuth().currentUser?.getIdToken();
        if (token) {
          const res = await fetch(`/api/short-links?church_id=${churchId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setLinks(data.links || []);
          }
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  if (!isAdmin(activeMembership)) return null;

  const currentTier = church?.subscription_tier || "free";
  const limits = TIER_LIMITS[currentTier] || TIER_LIMITS.free;
  const shortLinksLimit = limits.short_links;

  async function handleExpireNow(linkId: string) {
    if (!churchId) return;
    setExpiring(linkId);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch("/api/short-links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ church_id: churchId, link_id: linkId, action: "expire_now" }),
      });
      if (res.ok) {
        const { expires_at } = await res.json();
        setLinks((prev) =>
          prev.map((l) => (l.id === linkId ? { ...l, expires_at } : l)),
        );
      }
    } catch {
      // silent
    } finally {
      setExpiring(null);
    }
  }

  async function handleCreateTestLink(e: React.FormEvent) {
    e.preventDefault();
    if (!churchId) return;
    setCreatingTest(true);
    setTestCreateError(null);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch("/api/short-links", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          church_id: churchId,
          slug: testSlug.trim().toLowerCase(),
          target_url: testTarget.trim(),
          label: testLabel.trim() || "Test link",
          expires_in_days: testExpiryDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestCreateError(data.error || "Failed to create link");
        return;
      }
      // Refetch list
      const listRes = await fetch(`/api/short-links?church_id=${churchId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        setLinks(listData.links || []);
      }
      setTestSlug("");
      setTestLabel("");
    } catch {
      setTestCreateError("Failed to create link");
    } finally {
      setCreatingTest(false);
    }
  }

  async function handleDelete(linkId: string) {
    setDeleting(linkId);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch("/api/short-links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ church_id: churchId, link_id: linkId }),
      });
      if (res.ok) {
        setLinks((prev) => prev.filter((l) => l.id !== linkId));
      }
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  }

  const now = new Date().toISOString();
  const activeLinks = links.filter((l) => l.expires_at > now);
  const expiredLinks = links.filter((l) => l.expires_at <= now);

  function daysRemaining(expiresAt: string) {
    return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function getLinkTypeLabel(targetUrl: string) {
    if (targetUrl.includes("/join/")) return "Volunteer signup";
    if (targetUrl.includes("/events/")) return "Event signup";
    return "Link";
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Short Links</h1>
        <p className="mt-1 text-vc-text-secondary">
          Manage shareable short links for events and volunteer signups.
        </p>
      </div>

      <div className="rounded-xl border border-vc-border-light bg-white p-6">
        {/* Usage meter */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-vc-text">
              {activeLinks.length} of {shortLinksLimit === 0 ? "0" : shortLinksLimit} active short links
            </p>
            <p className="text-xs text-vc-text-muted">
              {shortLinksLimit === 0
                ? "Upgrade to a paid plan to create short links"
                : `${currentTier.charAt(0).toUpperCase() + currentTier.slice(1)} plan`}
            </p>
          </div>
          {shortLinksLimit > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-2 w-24 rounded-full bg-vc-bg-warm overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    activeLinks.length >= shortLinksLimit
                      ? "bg-vc-danger"
                      : activeLinks.length >= shortLinksLimit * 0.8
                        ? "bg-vc-sand"
                        : "bg-vc-sage"
                  }`}
                  style={{ width: `${Math.min(100, (activeLinks.length / shortLinksLimit) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <p className="mb-3 rounded-lg bg-vc-bg-warm px-4 py-3 text-xs text-vc-text-muted">
          Short links are created automatically when you share an event or volunteer join link.
          Use the share button on any event or your volunteer join page to generate a short link.
        </p>

        {/* Admin-only test-create form. Codex Phase 6 2026-05-18: testers
            need a deterministic way to create a short link with a specific
            slug/expiry, then verify the 404 path after expiration. */}
        {shortLinksLimit > 0 && (
          <details className="mb-5 rounded-lg border border-vc-border-light px-4 py-3 text-xs text-vc-text-secondary">
            <summary className="cursor-pointer font-medium">
              Create a test link (admin)
            </summary>
            <form onSubmit={handleCreateTestLink} className="mt-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wide text-vc-text-muted">Slug</span>
                  <input
                    required
                    value={testSlug}
                    onChange={(e) => setTestSlug(e.target.value)}
                    placeholder="phase6-test"
                    className="mt-0.5 w-full rounded border border-vc-border bg-white px-2 py-1.5 text-xs"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wide text-vc-text-muted">Label</span>
                  <input
                    value={testLabel}
                    onChange={(e) => setTestLabel(e.target.value)}
                    placeholder="Phase 6 retest"
                    className="mt-0.5 w-full rounded border border-vc-border bg-white px-2 py-1.5 text-xs"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="block text-[10px] uppercase tracking-wide text-vc-text-muted">Target URL or app path</span>
                  <input
                    required
                    value={testTarget}
                    onChange={(e) => setTestTarget(e.target.value)}
                    placeholder="/dashboard"
                    className="mt-0.5 w-full rounded border border-vc-border bg-white px-2 py-1.5 text-xs"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wide text-vc-text-muted">Expires in (days, 1–90)</span>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={testExpiryDays}
                    onChange={(e) => setTestExpiryDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                    className="mt-0.5 w-24 rounded border border-vc-border bg-white px-2 py-1.5 text-xs"
                  />
                </label>
                <div className="self-end">
                  <Button type="submit" loading={creatingTest} size="sm">
                    Create link
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-vc-text-muted">
                Tip: after creation, use <strong>Expire now</strong> on the link card to test the 404 path immediately.
              </p>
              {testCreateError && (
                <p className="text-[11px] text-vc-danger">{testCreateError}</p>
              )}
            </form>
          </details>
        )}

        {links.length === 0 && shortLinksLimit > 0 && (
          <p className="text-sm text-vc-text-muted py-4 text-center">
            No short links yet. Create one from the share options on any event or your volunteer join link.
          </p>
        )}

        {/* Active links */}
        {activeLinks.length > 0 && (
          <div className="space-y-2">
            {activeLinks.map((link) => {
              const days = daysRemaining(link.expires_at);
              return (
                <div key={link.id} className="flex items-center gap-3 rounded-xl border border-vc-border-light p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-vc-coral/10">
                    <svg className="h-4 w-4 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-vc-indigo truncate">/s/{link.slug}</p>
                      <span className="shrink-0 rounded-full bg-vc-indigo/5 px-2 py-0.5 text-[10px] font-medium text-vc-text-secondary">{getLinkTypeLabel(link.target_url)}</span>
                    </div>
                    <p className="text-xs text-vc-text-muted truncate">{link.label}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-xs font-medium ${days <= 3 ? "text-vc-danger" : days <= 7 ? "text-vc-sand" : "text-vc-text-secondary"}`}>
                      {days <= 0 ? "Expiring today" : `${days}d remaining`}
                    </p>
                    <p className="text-[10px] text-vc-text-muted">Expires {formatDate(link.expires_at)}</p>
                  </div>
                  <button
                    onClick={() => handleExpireNow(link.id)}
                    disabled={expiring === link.id}
                    className="shrink-0 rounded-lg border border-vc-border-light px-2 py-1 text-[11px] font-medium text-vc-text-muted hover:border-vc-sand hover:text-vc-sand-dark transition-colors disabled:opacity-50"
                    title="Force this link to expire immediately (for testing the 404 path)"
                  >
                    {expiring === link.id ? "Expiring…" : "Expire now"}
                  </button>
                  <button onClick={() => handleDelete(link.id)} disabled={deleting === link.id} className="shrink-0 rounded-lg p-1.5 text-vc-text-muted hover:bg-vc-danger/5 hover:text-vc-danger transition-colors" title="Delete short link">
                    {deleting === link.id ? (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-vc-border border-t-vc-danger" />
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Expired links */}
        {expiredLinks.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-vc-text-muted hover:text-vc-text-secondary transition-colors">
              {expiredLinks.length} expired link{expiredLinks.length !== 1 ? "s" : ""}
            </summary>
            <div className="mt-2 space-y-2">
              {expiredLinks.map((link) => (
                <div key={link.id} className="flex items-center gap-3 rounded-xl border border-vc-border-light bg-vc-bg-warm/50 p-3 opacity-60">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-vc-bg-cream">
                    <svg className="h-4 w-4 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-vc-text-muted truncate">/s/{link.slug}</p>
                    <p className="text-xs text-vc-text-muted truncate">{link.label}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-vc-text-muted">Expired {formatDate(link.expires_at)}</p>
                  </div>
                  <button onClick={() => handleDelete(link.id)} disabled={deleting === link.id} className="shrink-0 rounded-lg p-1.5 text-vc-text-muted hover:bg-vc-danger/5 hover:text-vc-danger transition-colors" title="Delete">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
