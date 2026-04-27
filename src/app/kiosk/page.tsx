"use client";

/**
 * Kiosk activation page (Track B).
 *
 * - If the device already has a stored kiosk token, redirects to /checkin.
 * - Otherwise renders an 8-character code input. On submit, POSTs to
 *   /api/kiosk/activate, stores the long-lived token + bound church_id, and
 *   redirects to /checkin.
 *
 * This is the only page a kiosk operator interacts with during enrollment.
 * Once enrolled, the kiosk normally launches straight to /checkin.
 */

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  getStoredKioskToken,
  setKioskCredentials,
} from "@/lib/kiosk-client";

export default function KioskActivationPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stationName, setStationName] = useState<string | null>(null);

  // If already activated, go straight to check-in.
  useEffect(() => {
    if (getStoredKioskToken()) {
      router.replace("/checkin");
    }
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cleaned = code.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[0-9A-F]{8}$/.test(cleaned)) {
      setError("Enter the 8-character code (letters A–F and digits 0–9).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/kiosk/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: cleaned,
          // Best-effort fingerprint: helps an admin see "this code was used
          // by a Mac running Safari" without doing real device tracking.
          device_fingerprint:
            typeof navigator !== "undefined"
              ? navigator.userAgent.slice(0, 200)
              : null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errCode = body.error as string | undefined;
        if (errCode === "not_found") {
          setError(
            "We couldn't find that activation code. Double-check the code your admin gave you.",
          );
        } else if (errCode === "expired") {
          setError(
            "That activation code has expired. Ask your admin for a new one.",
          );
        } else if (errCode === "consumed") {
          setError(
            "That code was already used. Ask your admin to issue a new one.",
          );
        } else if (errCode === "station_revoked") {
          setError(
            "This kiosk station has been revoked. Ask your admin to enroll a new one.",
          );
        } else {
          setError("Activation failed. Please try again.");
        }
        return;
      }

      const data = (await res.json()) as {
        token: string;
        station: { id: string; church_id: string; name: string };
      };

      setKioskCredentials({
        token: data.token,
        church_id: data.station.church_id,
        station_id: data.station.id,
      });
      setStationName(data.station.name);

      // Brief success flash, then route into the kiosk.
      setTimeout(() => {
        router.replace("/checkin");
      }, 1200);
    } catch {
      setError("Network error. Check the device's internet connection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-vc-bg px-6">
      <div className="w-full max-w-md rounded-2xl border border-vc-border-light bg-white p-8 shadow-sm">
        <h1 className="font-display text-3xl text-vc-indigo">Enroll this kiosk</h1>
        <p className="mt-2 text-sm text-vc-text-secondary">
          An admin generated an 8-character activation code in your
          organization&apos;s VolunteerCal settings. Enter it below to bind
          this device to your church.
        </p>

        {stationName ? (
          <div className="mt-6 rounded-xl bg-vc-sage/10 px-4 py-4 text-center">
            <p className="text-sm text-vc-text-secondary">
              <strong className="text-vc-sage">Activated as &ldquo;{stationName}&rdquo;</strong>
            </p>
            <p className="mt-1 text-xs text-vc-text-muted">
              Loading check-in&hellip;
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-vc-indigo">
                Activation code
              </span>
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="A3F5E8D9"
                maxLength={9}
                disabled={submitting}
                className="mt-2 block w-full rounded-lg border border-vc-border-light bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] text-vc-indigo focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
              />
            </label>

            {error && (
              <p className="rounded-lg bg-vc-coral/5 px-3 py-2 text-sm text-vc-coral">
                ⚠ {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={submitting || code.trim().length === 0}
              className="w-full"
            >
              {submitting ? "Activating…" : "Activate kiosk"}
            </Button>
          </form>
        )}

        <p className="mt-6 text-xs text-vc-text-muted">
          Activation codes expire 10 minutes after they&apos;re generated. If
          yours doesn&apos;t work, ask your admin to issue a new one from{" "}
          <span className="font-mono">Settings → Check-Ins → Stations</span>.
        </p>
      </div>
    </div>
  );
}
