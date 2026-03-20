"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(true); // default hidden until check

  useEffect(() => {
    // Check if already dismissed
    if (localStorage.getItem("vc_pwa_install_dismissed") === "true") return;

    // Check if already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    setDismissed(false);

    // Detect iOS Safari
    const ua = navigator.userAgent;
    const isiOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIos(isiOS);

    // Listen for Chrome/Android install prompt
    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  function dismiss() {
    setDismissed(true);
    localStorage.setItem("vc_pwa_install_dismissed", "true");
  }

  async function handleInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") dismiss();
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosInstructions(true);
    }
  }

  if (dismissed) return null;
  // Only show if we have a native prompt or are on iOS
  if (!deferredPrompt && !isIos) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="mb-6 rounded-xl bg-vc-indigo px-5 py-4 text-white"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">
              Install VolunteerCal on your device
            </p>
            <p className="mt-0.5 text-sm text-white/70">
              Get quick access and offline support — no app store needed.
            </p>
            {showIosInstructions && (
              <p className="mt-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/90">
                Tap the <strong>Share</strong> button (square with arrow), then tap <strong>&quot;Add to Home Screen.&quot;</strong>
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleInstall}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-vc-indigo transition-colors hover:bg-white/90 active:scale-[0.98]"
            >
              {isIos && !deferredPrompt ? "How to Install" : "Install"}
            </button>
            <button
              onClick={dismiss}
              className="rounded-full px-3 py-2 text-sm text-white/60 transition-colors hover:text-white"
              aria-label="Dismiss install banner"
            >
              Not now
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
