"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";

interface Settings {
  equipment_tags: string[];
  require_approval: boolean;
  max_advance_days: number;
  default_setup_minutes: number;
  default_teardown_minutes: number;
  public_calendar_enabled: boolean;
  public_calendar_token: string;
}

const DEFAULT_SETTINGS: Settings = {
  equipment_tags: [],
  require_approval: false,
  max_advance_days: 90,
  default_setup_minutes: 15,
  default_teardown_minutes: 15,
  public_calendar_enabled: false,
  public_calendar_token: "",
};

export default function RoomSettingsPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [copied, setCopied] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/rooms/settings?church_id=${encodeURIComponent(churchId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setSettings({ ...DEFAULT_SETTINGS, ...json.settings });
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, churchId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleSave() {
    if (!user || !churchId) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/rooms/settings", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          ...settings,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setSettings({ ...DEFAULT_SETTINGS, ...json.settings });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  function addTag() {
    const tag = newTag.trim();
    if (!tag || settings.equipment_tags.includes(tag)) return;
    setSettings((s) => ({
      ...s,
      equipment_tags: [...s.equipment_tags, tag],
    }));
    setNewTag("");
  }

  function removeTag(tag: string) {
    setSettings((s) => ({
      ...s,
      equipment_tags: s.equipment_tags.filter((t) => t !== tag),
    }));
  }

  function copyCalendarUrl() {
    if (!churchId || !settings.public_calendar_token) return;
    const url = `${window.location.origin}/api/calendar/church/${churchId}/${settings.public_calendar_token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vc-indigo font-display">
          Room Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure defaults for room reservations
        </p>
      </div>

      <div className="space-y-6">
        {/* Equipment Tags */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-vc-indigo font-display mb-3">
            Equipment Tags
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            Define equipment options available when booking rooms.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {settings.equipment_tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full bg-vc-sand/30 px-3 py-1 text-sm text-vc-indigo/70"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18 18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
              placeholder="e.g. Projector, Whiteboard, Sound System"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
            />
            <button
              onClick={addTag}
              disabled={!newTag.trim()}
              className="rounded-lg bg-vc-indigo/10 px-4 py-2 text-sm font-medium text-vc-indigo hover:bg-vc-indigo/20 transition-colors disabled:opacity-50 min-h-[44px]"
            >
              Add
            </button>
          </div>
        </div>

        {/* Approval & Limits */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-vc-indigo font-display mb-4">
            Booking Defaults
          </h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.require_approval}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    require_approval: e.target.checked,
                  }))
                }
                className="h-5 w-5 rounded border-gray-300 text-vc-coral focus:ring-vc-coral/30"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">
                  Require admin approval for all reservations
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  When enabled, all bookings go to the approval queue
                </p>
              </div>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Advance Days
                </label>
                <input
                  type="number"
                  value={settings.max_advance_days}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      max_advance_days: parseInt(e.target.value, 10) || 90,
                    }))
                  }
                  min={1}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Setup (min)
                </label>
                <input
                  type="number"
                  value={settings.default_setup_minutes}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      default_setup_minutes:
                        parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  min={0}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teardown (min)
                </label>
                <input
                  type="number"
                  value={settings.default_teardown_minutes}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      default_teardown_minutes:
                        parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  min={0}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Public Calendar */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-vc-indigo font-display mb-3">
            Public Calendar
          </h2>
          <label className="flex items-center gap-3 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={settings.public_calendar_enabled}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  public_calendar_enabled: e.target.checked,
                }))
              }
              className="h-5 w-5 rounded border-gray-300 text-vc-coral focus:ring-vc-coral/30"
            />
            <span className="text-sm font-medium text-gray-700">
              Enable public calendar feed
            </span>
          </label>
          {settings.public_calendar_token && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/calendar/church/${churchId}/${settings.public_calendar_token}`}
                className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 outline-none"
              />
              <button
                onClick={copyCalendarUrl}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-vc-coral px-6 py-2.5 text-sm font-medium text-white hover:bg-vc-coral/90 transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
          {saved && (
            <span className="text-sm text-vc-sage font-medium">Saved!</span>
          )}
        </div>
      </div>
    </div>
  );
}
