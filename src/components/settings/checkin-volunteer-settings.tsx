"use client";

import { useState } from "react";
import { updateDocument } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Church, Campus } from "@/lib/types";

interface CheckinVolunteerSettingsProps {
  churchId: string;
  church: Church;
  setChurch: (church: Church) => void;
  selfCheckInEnabled: boolean;
  setSelfCheckInEnabled: (v: boolean) => void;
  windowBefore: number;
  setWindowBefore: (v: number) => void;
  windowAfter: number;
  setWindowAfter: (v: number) => void;
  proximityEnabled: boolean;
  setProximityEnabled: (v: boolean) => void;
  proximityRadius: number;
  setProximityRadius: (v: number) => void;
  campuses: Campus[];
}

export function CheckinVolunteerSettings({
  churchId,
  church,
  setChurch,
  selfCheckInEnabled,
  setSelfCheckInEnabled,
  windowBefore,
  setWindowBefore,
  windowAfter,
  setWindowAfter,
  proximityEnabled,
  setProximityEnabled,
  proximityRadius,
  setProximityRadius,
  campuses,
}: CheckinVolunteerSettingsProps) {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  async function handleSave() {
    setSaving(true);
    try {
      const updatedSettings = {
        ...church.settings,
        self_check_in_enabled: selfCheckInEnabled,
        check_in_window_before: windowBefore,
        check_in_window_after: windowAfter,
        proximity_check_in_enabled: proximityEnabled,
        proximity_radius_meters: proximityRadius,
      };
      await updateDocument("churches", churchId, { settings: updatedSettings });
      setChurch({ ...church, settings: updatedSettings });
      setSuccess("Check-in settings saved.");
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-vc-indigo">Volunteer Check-In</h2>
      <div className="rounded-xl border border-vc-border-light bg-white p-6">
        <div className="space-y-5">
          {/* Self-check-in toggle */}
          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-vc-indigo">Allow self-check-in</p>
              <p className="text-xs text-vc-text-muted">
                Volunteers can check in from the app without scanning a QR code
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={selfCheckInEnabled}
              onClick={() => setSelfCheckInEnabled(!selfCheckInEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                selfCheckInEnabled ? "bg-vc-sage" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                  selfCheckInEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>

          {/* Window settings */}
          {selfCheckInEnabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-vc-indigo">
                  Minutes before service
                </label>
                <Input
                  type="number"
                  min={5}
                  max={180}
                  value={windowBefore}
                  onChange={(e) => setWindowBefore(parseInt(e.target.value, 10) || 60)}
                  className="max-w-[120px]"
                />
                <p className="mt-1 text-xs text-vc-text-muted">
                  Check-in opens this many minutes before the service starts
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-vc-indigo">
                  Minutes after start
                </label>
                <Input
                  type="number"
                  min={5}
                  max={120}
                  value={windowAfter}
                  onChange={(e) => setWindowAfter(parseInt(e.target.value, 10) || 30)}
                  className="max-w-[120px]"
                />
                <p className="mt-1 text-xs text-vc-text-muted">
                  Check-in window closes this many minutes after service starts
                </p>
              </div>
            </div>
          )}

          {/* Proximity settings */}
          {selfCheckInEnabled && campuses.some((c) => c.location) && (
            <>
              <div className="border-t border-vc-border-light pt-5">
                <label className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-vc-indigo">Enable proximity check-in</p>
                    <p className="text-xs text-vc-text-muted">
                      Volunteers near a campus will be prompted to check in automatically
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={proximityEnabled}
                    onClick={() => setProximityEnabled(!proximityEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      proximityEnabled ? "bg-vc-sage" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                        proximityEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </label>
              </div>

              {proximityEnabled && (
                <div className="max-w-xs">
                  <label className="mb-1 block text-sm font-medium text-vc-indigo">
                    Proximity radius (meters)
                  </label>
                  <Input
                    type="number"
                    min={50}
                    max={2000}
                    value={proximityRadius}
                    onChange={(e) => setProximityRadius(parseInt(e.target.value, 10) || 200)}
                  />
                  <p className="mt-1 text-xs text-vc-text-muted">
                    How close a volunteer must be to a campus to trigger proximity check-in
                  </p>
                </div>
              )}
            </>
          )}

          {/* Save */}
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleSave} loading={saving}>
              Save Check-In Settings
            </Button>
            {success && <span className="text-sm text-vc-sage">{success}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
