"use client";

import { useState } from "react";
import Link from "next/link";
import { addChurchDocument } from "@/lib/firebase/firestore";
import type { CalendarFeed, Ministry } from "@/lib/types";

interface CalendarFeedCtaProps {
  churchId: string;
  volunteerId: string;
  myMinistryIds: string[];
  ministries: Map<string, Ministry>;
  existingFeeds: CalendarFeed[];
}

type FeedChoice = "personal" | "team";

export function CalendarFeedCta({
  churchId,
  volunteerId,
  myMinistryIds,
  ministries,
  existingFeeds,
}: CalendarFeedCtaProps) {
  const [choice, setChoice] = useState<FeedChoice>("personal");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Find existing feeds for this volunteer
  const personalFeed = existingFeeds.find(
    (f) => f.type === "personal" && f.target_id === volunteerId,
  );
  const teamFeed = existingFeeds.find(
    (f) => f.type === "team" && f.target_id === volunteerId,
  );

  const activeFeed = choice === "personal" ? personalFeed : teamFeed;

  const feedUrl = activeFeed
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/calendar?token=${activeFeed.secret_token}&type=${activeFeed.type}`
    : null;

  async function createFeed() {
    setCreating(true);
    try {
      await addChurchDocument(churchId, "calendar_feeds", {
        church_id: churchId,
        type: choice,
        target_id: volunteerId,
        secret_token: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      });
      // Force a page reload to pick up the new feed
      window.location.reload();
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  }

  function copyUrl() {
    if (!feedUrl) return;
    navigator.clipboard.writeText(feedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const teamNames = myMinistryIds
    .map((id) => ministries.get(id)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mt-6 rounded-xl border border-vc-border-light bg-white p-5">
      <div className="flex items-center gap-2 mb-1">
        <svg className="h-5 w-5 text-vc-indigo" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        </svg>
        <h3 className="font-semibold text-vc-indigo">Sync to Your Phone</h3>
      </div>
      <p className="text-sm text-vc-text-muted mb-4">
        Subscribe in Google Calendar, Outlook, or Apple Calendar.
      </p>

      {/* Feed type toggle */}
      <div className="mb-4 flex gap-1 rounded-lg bg-vc-bg-warm p-1">
        <button
          onClick={() => setChoice("personal")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            choice === "personal"
              ? "bg-white text-vc-indigo shadow-sm"
              : "text-vc-text-muted hover:text-vc-indigo"
          }`}
        >
          My schedule
        </button>
        {myMinistryIds.length > 0 && (
          <button
            onClick={() => setChoice("team")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              choice === "team"
                ? "bg-white text-vc-indigo shadow-sm"
                : "text-vc-text-muted hover:text-vc-indigo"
            }`}
          >
            My teams
          </button>
        )}
      </div>

      {/* Description */}
      <p className="mb-3 text-xs text-vc-text-muted">
        {choice === "personal"
          ? "Only your own assignments and signups."
          : `All assignments for: ${teamNames || "your teams"}.`}
      </p>

      {/* Feed URL or create button */}
      {activeFeed && feedUrl ? (
        <div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={feedUrl}
              className="flex-1 rounded-lg border border-vc-border bg-vc-bg-warm px-3 py-2 text-xs text-vc-text-secondary"
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={copyUrl}
              className="shrink-0 rounded-lg bg-vc-coral px-3 py-2 text-xs font-medium text-white hover:bg-vc-coral-dark transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-vc-text-muted">
            Add this URL to Google Calendar (Other calendars &rarr; From URL) or Outlook (Subscribe from web).
          </p>
        </div>
      ) : (
        <button
          onClick={createFeed}
          disabled={creating}
          className="rounded-lg bg-vc-coral px-4 py-2 text-sm font-medium text-white hover:bg-vc-coral-dark transition-colors disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create Feed"}
        </button>
      )}

      {/* Link to full feed management */}
      <div className="mt-3 border-t border-vc-border-light pt-3">
        <Link
          href="/dashboard/account"
          className="text-xs text-vc-text-muted hover:text-vc-coral transition-colors"
        >
          More feed options in Account Settings &rarr;
        </Link>
      </div>
    </div>
  );
}
