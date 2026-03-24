"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "vc_kiosk_install_dismissed";

/**
 * Kiosk install prompt — shows when the kiosk is running in a browser
 * (not standalone/PWA mode). Platform-aware instructions.
 */
export function KioskInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Don't show inside Capacitor native app
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;
    if (typeof cap?.isNativePlatform === "function" && cap.isNativePlatform()) return;

    // Don't show if already in standalone mode or dismissed
    const isStandalone = window.matchMedia(
      "(display-mode: standalone)",
    ).matches;
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (isStandalone || dismissed) return;

    // Detect iOS Safari
    const ua = navigator.userAgent;
    const ios =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(ios);

    if (ios) {
      // iOS doesn't support beforeinstallprompt — show manual instructions
      setVisible(true);
    } else {
      // Chrome/Edge — listen for beforeinstallprompt
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
        setVisible(true);
      };
      window.addEventListener("beforeinstallprompt", handler);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    }
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center">
      <div className="bg-white/95 backdrop-blur-sm border border-vc-border-light rounded-2xl shadow-lg
        px-5 py-4 max-w-md w-full flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-vc-coral/10 flex items-center justify-center">
          <svg className="h-5 w-5 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-vc-indigo">
            Add to Home Screen
          </p>
          {isIOS ? (
            <p className="text-xs text-vc-text-secondary mt-0.5">
              Tap{" "}
              <svg className="inline h-3.5 w-3.5 -mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {" "}Share, then &ldquo;Add to Home Screen&rdquo; for a
              full-screen kiosk experience.
            </p>
          ) : deferredPrompt ? (
            <div className="flex items-center gap-2 mt-1.5">
              <button
                type="button"
                onClick={handleInstall}
                className="px-3 py-1.5 bg-vc-coral text-white text-xs font-semibold rounded-lg"
              >
                Install App
              </button>
            </div>
          ) : (
            <p className="text-xs text-vc-text-secondary mt-0.5">
              Add this page to your home screen for a full-screen kiosk
              experience.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-1"
          aria-label="Dismiss"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
