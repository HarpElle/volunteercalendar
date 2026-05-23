"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * RoomsSettingsSection — equipment tags, booking defaults, public-calendar
 * feed configuration for a church's room scheduling.
 *
 * Extracted from /dashboard/org/campuses (Phase 3c-ii). Now mounted at
 * /dashboard/rooms/settings as the Rooms → Settings tab.
 */

interface RoomSettings {
  equipment_tags: string[];
  require_approval: boolean;
  max_advance_days: number;
  default_setup_minutes: number;
  default_teardown_minutes: number;
  public_calendar_enabled: boolean;
  public_calendar_token: string;
}

const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  equipment_tags: [],
  require_approval: false,
  max_advance_days: 90,
  default_setup_minutes: 15,
  default_teardown_minutes: 15,
  public_calendar_enabled: false,
  public_calendar_token: "",
};

export function RoomsSettingsSection({ churchId }: { churchId: string }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newTag, setNewTag] = useState("");
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch(
          `/api/rooms/settings?church_id=${churchId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const data = await res.json();
          // GET returns { settings: {...} } — spread the inner object, not
          // the wrapper. Previously this spread the wrapper, so the page
          // always rendered the in-memory defaults (e.g. checkbox always
          // unchecked, URLs hidden) even when the API said otherwise.
          setSettings({
            ...DEFAULT_ROOM_SETTINGS,
            ...(data.settings || data),
          });
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, churchId]);

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/rooms/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ church_id: churchId, ...settings }),
      });
      if (res.ok) {
        // Refresh local state from the server so a freshly-regenerated
        // public_calendar_token (when enable flips from false → true) is
        // visible immediately without a page reload.
        const data = await res.json().catch(() => ({}));
        if (data?.settings) {
          setSettings({ ...DEFAULT_ROOM_SETTINGS, ...data.settings });
        }
        setSaved(true);
        if (savedTimeout.current) clearTimeout(savedTimeout.current);
        savedTimeout.current = setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [user, churchId, settings]);

  function addTag() {
    const tag = newTag.trim();
    if (!tag || settings.equipment_tags.includes(tag)) return;
    setSettings((s) => ({ ...s, equipment_tags: [...s.equipment_tags, tag] }));
    setNewTag("");
  }

  function removeTag(tag: string) {
    setSettings((s) => ({ ...s, equipment_tags: s.equipment_tags.filter((t) => t !== tag) }));
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Spinner /></div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl text-vc-indigo">Room Settings</h2>

      {/* Equipment Tags */}
      <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
        <h3 className="mb-1 font-display text-lg text-vc-indigo">Equipment Tags</h3>
        <p className="mb-4 text-sm text-vc-text-secondary">Tags that can be assigned to rooms for filtering.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {settings.equipment_tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1.5 rounded-full bg-vc-sand/25 px-3 py-1 text-sm text-vc-text">
              {tag}
              <button onClick={() => removeTag(tag)} className="text-vc-text-muted hover:text-vc-danger" aria-label={`Remove ${tag}`}>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} placeholder="Projector, Whiteboard, Sound System..." className="min-h-[44px] w-full max-w-xs rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30" />
          <Button size="sm" variant="outline" onClick={addTag} disabled={!newTag.trim()}>Add</Button>
        </div>
      </section>

      {/* Booking Defaults */}
      <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
        <h3 className="mb-1 font-display text-lg text-vc-indigo">Booking Defaults</h3>
        <p className="mb-4 text-sm text-vc-text-secondary">Default values for new room reservations.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="flex items-center gap-3 text-sm font-medium text-vc-text">
              <input type="checkbox" checked={settings.require_approval} onChange={(e) => setSettings((s) => ({ ...s, require_approval: e.target.checked }))} className="h-4 w-4 rounded border-vc-border-light text-vc-coral accent-vc-coral" />
              Require approval for all reservations
            </label>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">Max advance booking (days)</label>
            <input type="number" min={1} value={settings.max_advance_days} onChange={(e) => setSettings((s) => ({ ...s, max_advance_days: parseInt(e.target.value, 10) || 90 }))} className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">Default setup time (minutes)</label>
            <input type="number" min={0} value={settings.default_setup_minutes} onChange={(e) => setSettings((s) => ({ ...s, default_setup_minutes: parseInt(e.target.value, 10) || 0 }))} className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">Default teardown time (minutes)</label>
            <input type="number" min={0} value={settings.default_teardown_minutes} onChange={(e) => setSettings((s) => ({ ...s, default_teardown_minutes: parseInt(e.target.value, 10) || 0 }))} className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30" />
          </div>
        </div>
      </section>

      {/* Public Calendar */}
      <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
        <h3 className="mb-1 font-display text-lg text-vc-indigo">Public Calendar</h3>
        <p className="mb-4 text-sm text-vc-text-secondary">
          Expose room availability via a browser page and/or an iCal feed.
          Token is regenerated each time you disable + re-enable.
        </p>
        <label className="flex items-center gap-3 text-sm font-medium text-vc-text">
          <input type="checkbox" checked={settings.public_calendar_enabled} onChange={(e) => setSettings((s) => ({ ...s, public_calendar_enabled: e.target.checked }))} className="h-4 w-4 rounded border-vc-border-light text-vc-coral accent-vc-coral" />
          Enable public calendar feed
        </label>
        {settings.public_calendar_enabled && settings.public_calendar_token && (
          <div className="mt-3 space-y-3">
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-vc-text-muted">
                Browser page
              </p>
              <p className="rounded-lg bg-white px-3 py-2 text-xs break-all text-vc-indigo">
                {typeof window !== "undefined"
                  ? `${window.location.origin}/calendar/public?church_id=${churchId}&token=${settings.public_calendar_token}`
                  : `/calendar/public?church_id=${churchId}&token=${settings.public_calendar_token}`}
              </p>
              <p className="mt-1 text-[11px] text-vc-text-muted">
                Append <code>&amp;embed=true</code> for iframe embedding.
              </p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-vc-text-muted">
                iCal feed
              </p>
              <p className="rounded-lg bg-white px-3 py-2 text-xs break-all text-vc-text-muted">
                {typeof window !== "undefined"
                  ? `${window.location.origin}/api/calendar/church/${churchId}/${settings.public_calendar_token}`
                  : `/api/calendar/church/${churchId}/${settings.public_calendar_token}`}
              </p>
            </div>
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saving}>Save Room Settings</Button>
        {saved && <Badge variant="success">Saved</Badge>}
      </div>
    </div>
  );
}
