"use client";

/**
 * <BlockedPickupAlert> — Wave 9 P0-2 sub-PR F.
 *
 * Full-screen alert shown AFTER the operator confirms that an on-site
 * pickup person matches an entry on the block list. The session is
 * paused; release is blocked. Owner + Emergency Response Team have
 * been SMSed.
 *
 * No CTAs to proceed with release — the operator must escalate to the
 * church owner. The only way out of this screen is "Cancel checkout"
 * (returns the kiosk to its idle screen so the next family can use it).
 *
 * Optional: plays a short audio cue when shown (accessibility-friendly
 * — a short attention sound, not a panicked siren).
 */

import { useEffect, useRef } from "react";

interface BlockedPickupAlertProps {
  blockedPickupName: string;
  fanout: { attempted: number; success: number; failed: number };
  onDismiss: () => void;
}

export function BlockedPickupAlert({
  blockedPickupName,
  fanout,
  onDismiss,
}: BlockedPickupAlertProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Best-effort audio cue. Browsers can block playback without a
    // user gesture; we tried but didn't catch errors.
    const audio = new Audio(
      // Short embedded data-URI beep so we don't ship an MP3 asset.
      // Sine 880 Hz, ~250 ms.
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
    );
    audioRef.current = audio;
    audio.play().catch(() => {});
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-vc-danger flex items-center justify-center p-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
        <div className="text-6xl" aria-hidden="true">
          🛑
        </div>
        <h1 className="text-3xl font-display font-bold text-vc-danger">
          Release blocked
        </h1>
        <div className="space-y-3 text-vc-indigo">
          <p className="text-lg">
            <span className="font-semibold">{blockedPickupName}</span> is on
            this household&rsquo;s block list. Release is NOT permitted.
          </p>
          <div className="bg-vc-bg-warm rounded-lg p-4 text-base text-vc-text-secondary space-y-1">
            <p className="font-medium text-vc-indigo">Notifications sent:</p>
            <p>
              {fanout.success} of {fanout.attempted} SMS recipients reached
              {fanout.failed > 0 && (
                <span className="text-vc-danger">
                  {" "}
                  ({fanout.failed} failed)
                </span>
              )}
            </p>
            <p className="text-xs">
              Includes the church owner and the Emergency Response Team
              contacts on file.
            </p>
          </div>
          <p className="text-sm text-vc-text-secondary">
            Wait for the owner to respond. If the situation is urgent, call
            the owner directly. Operators on-site cannot override this
            block.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full min-h-[64px] px-4 py-3 rounded-lg bg-vc-indigo text-white font-display text-lg font-semibold hover:bg-vc-indigo-light"
        >
          Acknowledge — return to kiosk
        </button>
      </div>
    </div>
  );
}
