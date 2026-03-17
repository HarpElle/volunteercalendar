"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import {
  addChurchDocument,
  getChurchDocuments,
  removeChurchDocument,
} from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import type { CalendarFeed, CalendarFeedType, Ministry, Volunteer } from "@/lib/types";

export default function SettingsPage() {
  const { profile } = useAuth();
  const churchId = profile?.church_id;

  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Create feed form
  const [showCreate, setShowCreate] = useState(false);
  const [feedType, setFeedType] = useState<CalendarFeedType>("personal");
  const [targetId, setTargetId] = useState("");

  useEffect(() => {
    if (!churchId) return;
    async function load() {
      try {
        const [feedDocs, volDocs, minDocs] = await Promise.all([
          getChurchDocuments(churchId!, "calendar_feeds"),
          getChurchDocuments(churchId!, "volunteers"),
          getChurchDocuments(churchId!, "ministries"),
        ]);
        setFeeds(feedDocs as unknown as CalendarFeed[]);
        setVolunteers(volDocs as unknown as Volunteer[]);
        setMinistries(minDocs as unknown as Ministry[]);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  async function handleCreateFeed() {
    if (!churchId) return;
    if (feedType !== "org" && !targetId) return;
    setCreating(true);

    try {
      const feedData = {
        church_id: churchId,
        type: feedType,
        target_id: feedType === "org" ? churchId : targetId,
        secret_token: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      };
      const ref = await addChurchDocument(churchId, "calendar_feeds", feedData);
      setFeeds((prev) => [{ id: ref.id, ...feedData }, ...prev]);
      setShowCreate(false);
      setTargetId("");
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteFeed(feedId: string) {
    if (!churchId) return;
    try {
      await removeChurchDocument(churchId, "calendar_feeds", feedId);
      setFeeds((prev) => prev.filter((f) => f.id !== feedId));
    } catch {
      // silent
    }
  }

  function getFeedUrl(feed: CalendarFeed): string {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/api/calendar?token=${feed.secret_token}&type=${feed.type}`;
  }

  function getFeedLabel(feed: CalendarFeed): string {
    if (feed.type === "org") return "All Volunteers";
    if (feed.type === "ministry") {
      const m = ministries.find((m) => m.id === feed.target_id);
      return m?.name || "Ministry";
    }
    if (feed.type === "personal") {
      const v = volunteers.find((v) => v.id === feed.target_id);
      return v?.name || "Volunteer";
    }
    return feed.type;
  }

  function handleCopy(feedId: string, url: string) {
    navigator.clipboard.writeText(url);
    setCopied(feedId);
    setTimeout(() => setCopied(null), 2000);
  }

  const feedTypeLabels: Record<CalendarFeedType, string> = {
    personal: "Personal (one volunteer)",
    ministry: "Ministry (all in one ministry)",
    team: "Team",
    org: "Organization (everyone)",
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-vc-indigo">Settings</h1>
        <p className="mt-1 text-vc-text-secondary">
          Manage calendar feeds and church configuration.
        </p>
      </div>

      {/* Calendar Feeds Section */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-vc-indigo">Calendar Feeds</h2>
            <p className="text-sm text-vc-text-muted">
              Create .ics feed URLs for Google Calendar, Outlook, or Apple Calendar.
            </p>
          </div>
          {!showCreate && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              New Feed
            </Button>
          )}
        </div>

        {/* Create feed form */}
        {showCreate && (
          <div className="mb-6 rounded-xl border border-vc-border-light bg-white p-5">
            <h3 className="mb-3 font-medium text-vc-indigo">Create Calendar Feed</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-vc-text">Feed Type</label>
                <select
                  value={feedType}
                  onChange={(e) => {
                    setFeedType(e.target.value as CalendarFeedType);
                    setTargetId("");
                  }}
                  className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                >
                  <option value="personal">{feedTypeLabels.personal}</option>
                  <option value="ministry">{feedTypeLabels.ministry}</option>
                  <option value="org">{feedTypeLabels.org}</option>
                </select>
              </div>

              {feedType === "personal" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-vc-text">Volunteer</label>
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                  >
                    <option value="">Select a volunteer...</option>
                    {volunteers
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                  </select>
                </div>
              )}

              {feedType === "ministry" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-vc-text">Ministry</label>
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                  >
                    <option value="">Select a ministry...</option>
                    {ministries.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-3">
                <Button loading={creating} onClick={handleCreateFeed}>
                  Create Feed
                </Button>
                <Button variant="ghost" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Feed list */}
        {loading ? (
          <div className="py-8 text-center text-vc-text-muted">Loading...</div>
        ) : feeds.length === 0 && !showCreate ? (
          <div className="rounded-xl border border-dashed border-vc-border bg-white p-8 text-center">
            <svg className="mx-auto mb-3 h-8 w-8 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            <p className="text-vc-text-secondary">No calendar feeds yet.</p>
            <p className="mt-1 text-sm text-vc-text-muted">
              Create a feed to sync schedules to Google Calendar, Outlook, or Apple Calendar.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {feeds.map((feed) => {
              const url = getFeedUrl(feed);
              return (
                <div key={feed.id} className="rounded-xl border border-vc-border-light bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex rounded-full bg-vc-indigo/10 px-2 py-0.5 text-xs font-medium text-vc-indigo">
                          {feed.type}
                        </span>
                        <span className="font-medium text-vc-indigo">{getFeedLabel(feed)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <code className="block min-w-0 flex-1 truncate rounded bg-vc-bg-warm px-2 py-1 text-xs text-vc-text-muted">
                          {url}
                        </code>
                        <button
                          onClick={() => handleCopy(feed.id, url)}
                          className="shrink-0 rounded-lg border border-vc-border px-2.5 py-1 text-xs font-medium text-vc-text-secondary transition-colors hover:border-vc-coral hover:text-vc-coral"
                        >
                          {copied === feed.id ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteFeed(feed.id)}
                      className="shrink-0 text-vc-text-muted hover:text-vc-danger transition-colors"
                      title="Delete feed"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-vc-text-muted">
                    Add this URL to Google Calendar (Other calendars → From URL) or Outlook (Add calendar → Subscribe from web).
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Placeholder for future settings */}
      <section className="rounded-xl border border-dashed border-vc-border bg-vc-bg-warm/50 p-6 text-center">
        <p className="text-sm text-vc-text-muted">
          More settings coming soon: notification preferences, billing, integrations.
        </p>
      </section>
    </div>
  );
}
