"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CheckinThresholdsSettingsProps {
  churchId: string;
  guardianSmsEnabled: boolean;
}

export function CheckinThresholdsSettings({
  churchId,
  guardianSmsEnabled,
}: CheckinThresholdsSettingsProps) {
  const { user } = useAuth();
  const [thresholds, setThresholds] = useState({
    pre_checkin_window_minutes: 30,
    late_arrival_threshold_minutes: 15,
    capacity_sms_recipient_phone: "",
    guardian_sms_on_checkin: false,
    guardian_sms_on_checkout: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch(
          `/api/admin/checkin/settings?church_id=${churchId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const data = await res.json();
          setThresholds({
            pre_checkin_window_minutes:
              data.pre_checkin_window_minutes ?? 30,
            late_arrival_threshold_minutes:
              data.late_arrival_threshold_minutes ?? 15,
            capacity_sms_recipient_phone:
              data.capacity_sms_recipient_phone ?? "",
            guardian_sms_on_checkin:
              data.guardian_sms_on_checkin ?? false,
            guardian_sms_on_checkout:
              data.guardian_sms_on_checkout ?? false,
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
      const res = await fetch("/api/admin/checkin/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ church_id: churchId, ...thresholds }),
      });
      if (res.ok) {
        setSaved(true);
        if (savedTimeout.current) clearTimeout(savedTimeout.current);
        savedTimeout.current = setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [user, churchId, thresholds]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
        <h2 className="mb-1 font-display text-lg text-vc-indigo">
          Check-In Thresholds
        </h2>
        <p className="mb-4 text-sm text-vc-text-secondary">
          Configure timing windows for the check-in process.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
              Pre-check-in window (minutes)
            </label>
            <input
              type="number"
              min={5}
              max={120}
              value={thresholds.pre_checkin_window_minutes}
              onChange={(e) =>
                setThresholds((t) => ({
                  ...t,
                  pre_checkin_window_minutes: parseInt(e.target.value, 10) || 30,
                }))
              }
              className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
              Late arrival threshold (minutes)
            </label>
            <input
              type="number"
              min={5}
              max={60}
              value={thresholds.late_arrival_threshold_minutes}
              onChange={(e) =>
                setThresholds((t) => ({
                  ...t,
                  late_arrival_threshold_minutes:
                    parseInt(e.target.value, 10) || 15,
                }))
              }
              className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">
              Capacity SMS recipient phone (E.164)
            </label>
            <input
              type="tel"
              value={thresholds.capacity_sms_recipient_phone}
              onChange={(e) =>
                setThresholds((t) => ({
                  ...t,
                  capacity_sms_recipient_phone: e.target.value,
                }))
              }
              placeholder="+15551234567"
              className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
            />
          </div>
        </div>
      </section>

      {/* Guardian SMS Notifications */}
      <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
        <h2 className="mb-1 font-display text-lg text-vc-indigo">
          Guardian SMS Notifications
        </h2>
        <p className="mb-4 text-sm text-vc-text-secondary">
          Send text messages to the primary guardian when children are checked in or out.
        </p>

        {guardianSmsEnabled ? (
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm font-medium text-vc-text">
              <input
                type="checkbox"
                checked={thresholds.guardian_sms_on_checkin}
                onChange={(e) =>
                  setThresholds((t) => ({
                    ...t,
                    guardian_sms_on_checkin: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-vc-border-light text-vc-coral accent-vc-coral"
              />
              SMS on check-in
              <span className="text-xs font-normal text-vc-text-muted">
                — Includes child name, room, and security code
              </span>
            </label>
            <label className="flex items-center gap-3 text-sm font-medium text-vc-text">
              <input
                type="checkbox"
                checked={thresholds.guardian_sms_on_checkout}
                onChange={(e) =>
                  setThresholds((t) => ({
                    ...t,
                    guardian_sms_on_checkout: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-vc-border-light text-vc-coral accent-vc-coral"
              />
              SMS on checkout
              <span className="text-xs font-normal text-vc-text-muted">
                — Confirms child has been picked up
              </span>
            </label>
          </div>
        ) : (
          <p className="rounded-lg bg-vc-sand/20 px-3 py-2 text-sm text-vc-text-muted">
            Guardian SMS is available on Growth plans and above.
          </p>
        )}
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saving}>
          Save Check-In Settings
        </Button>
        {saved && <Badge variant="success">Saved</Badge>}
      </div>

      {/* Room Configuration link */}
      <section className="mt-2 rounded-xl border border-vc-border-light bg-vc-bg-warm p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-vc-indigo">
              Room Configuration
            </h3>
            <p className="mt-0.5 text-xs text-vc-text-secondary">
              Set grade ranges, capacity limits, and overflow routing for
              children&apos;s check-in rooms.
            </p>
          </div>
          <a
            href="/dashboard/checkin/rooms"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-vc-indigo shadow-sm ring-1 ring-vc-border-light transition-colors hover:bg-vc-bg"
          >
            Configure Rooms
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </a>
        </div>
      </section>
    </div>
  );
}
