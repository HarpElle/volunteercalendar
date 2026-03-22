"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import type { CheckInSettings, CheckInServiceTime, PrinterConfig } from "@/lib/types";

/**
 * /dashboard/checkin/settings — Service times, thresholds, printer config.
 */
export default function CheckInSettingsPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;
  const [settings, setSettings] = useState<Partial<CheckInSettings> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testingPrinter, setTestingPrinter] = useState<string | null>(null);
  const [sendingSms, setSendingSms] = useState(false);
  const [smsResult, setSmsResult] = useState<{ sent: number; skipped: number; failed: number } | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/settings?church_id=${churchId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        setSettings(await res.json());
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

  const saveSettings = async () => {
    if (!user || !churchId || !settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/checkin/settings", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ church_id: churchId, ...settings }),
      });
      if (res.ok) {
        setSettings(await res.json());
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const handleTestPrint = async (printerId: string) => {
    if (!user || !churchId) return;
    setTestingPrinter(printerId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/checkin/printer/test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ church_id: churchId, printer_id: printerId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.print_server_url) {
          await fetch(`${data.print_server_url}/print`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data.label_payload),
          });
        }
      }
    } catch {
      // silent
    } finally {
      setTestingPrinter(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-gray-100 animate-pulse" />
        <div className="h-48 rounded-xl bg-gray-100 animate-pulse" />
      </div>
    );
  }

  const serviceTimes = (settings?.service_times || []) as CheckInServiceTime[];
  const printers = (settings?.printers || []) as PrinterConfig[];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-vc-indigo font-display">
          Check-In Settings
        </h1>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-vc-sage font-medium">Saved!</span>
          )}
          <button
            type="button"
            onClick={saveSettings}
            disabled={saving}
            className="px-6 py-2 rounded-full bg-vc-coral text-white font-medium
              disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Service Times */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Service Times
        </h2>
        {serviceTimes.length === 0 ? (
          <p className="text-gray-400 text-sm">
            No service times configured. Check-in will default to all-day availability.
          </p>
        ) : (
          <div className="space-y-2">
            {serviceTimes.map((st) => (
              <div
                key={st.id}
                className="flex items-center gap-4 py-2 px-3 rounded-lg bg-gray-50"
              >
                <span className="font-medium text-vc-indigo w-28">
                  {dayNames[st.day_of_week]}
                </span>
                <span className="text-gray-600">
                  {st.start_time} – {st.end_time}
                </span>
                <span className="text-sm text-gray-400">{st.name}</span>
                <span
                  className={`text-xs ml-auto ${st.is_active ? "text-vc-sage" : "text-gray-400"}`}
                >
                  {st.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Thresholds */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Thresholds
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">
              Pre-check-in window (minutes)
            </label>
            <input
              type="number"
              value={settings?.pre_checkin_window_minutes ?? 30}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  pre_checkin_window_minutes: parseInt(e.target.value) || 30,
                }))
              }
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-vc-coral
                focus:ring-1 focus:ring-vc-coral/30 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">
              Late arrival threshold (minutes)
            </label>
            <input
              type="number"
              value={settings?.late_arrival_threshold_minutes ?? 15}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  late_arrival_threshold_minutes: parseInt(e.target.value) || 15,
                }))
              }
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-vc-coral
                focus:ring-1 focus:ring-vc-coral/30 outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm text-gray-500 mb-1">
              Capacity alert SMS phone (E.164)
            </label>
            <input
              type="text"
              placeholder="+15125551234"
              value={settings?.capacity_sms_recipient_phone ?? ""}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  capacity_sms_recipient_phone: e.target.value || undefined,
                }))
              }
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-vc-coral
                focus:ring-1 focus:ring-vc-coral/30 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Pre-Check-In SMS */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Pre-Check-In SMS
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Send a reminder text to all registered families before an upcoming service.
          Requires Pro tier and Twilio configuration.
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={async () => {
              if (!user || !churchId) return;
              setSendingSms(true);
              setSmsResult(null);
              try {
                const token = await user.getIdToken();
                const res = await fetch("/api/admin/checkin/sms/pre-checkin", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ church_id: churchId }),
                });
                if (res.ok) {
                  const data = await res.json();
                  setSmsResult({ sent: data.sent, skipped: data.skipped, failed: data.failed });
                } else {
                  const data = await res.json();
                  setSmsResult({ sent: 0, skipped: 0, failed: -1 });
                  if (data.error) {
                    // Show error in the result
                    setSmsResult(null);
                    alert(data.error);
                  }
                }
              } catch {
                alert("Network error sending SMS");
              } finally {
                setSendingSms(false);
              }
            }}
            disabled={sendingSms}
            className="px-5 py-2 rounded-full bg-vc-indigo text-white font-medium text-sm
              disabled:opacity-50 transition-colors"
          >
            {sendingSms ? "Sending..." : "Send Pre-Check-In SMS Now"}
          </button>
          {smsResult && (
            <span className="text-sm text-gray-600">
              Sent: {smsResult.sent} &middot; Skipped: {smsResult.skipped} &middot; Failed: {smsResult.failed}
            </span>
          )}
        </div>
      </div>

      {/* Printers */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Printers ({printers.length})
        </h2>
        {printers.length === 0 ? (
          <p className="text-gray-400 text-sm">
            No printers configured. Labels will be available for download but won&apos;t auto-print.
          </p>
        ) : (
          <div className="space-y-3">
            {printers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between py-3 px-4 rounded-lg bg-gray-50"
              >
                <div>
                  <p className="font-medium text-vc-indigo">{p.station_name}</p>
                  <p className="text-sm text-gray-500">
                    {p.printer_type} &middot; {p.ip_address}:{p.port || 9100}{" "}
                    &middot; {p.label_size}
                  </p>
                  {p.print_server_url && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Print server: {p.print_server_url}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium ${p.is_active ? "text-vc-sage" : "text-gray-400"}`}
                  >
                    {p.is_active ? "Active" : "Inactive"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleTestPrint(p.id)}
                    disabled={testingPrinter === p.id}
                    className="text-sm text-vc-coral font-medium underline disabled:opacity-50"
                  >
                    {testingPrinter === p.id ? "Testing..." : "Test Print"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
