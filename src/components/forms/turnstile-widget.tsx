"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile client widget for public forms.
 *
 * Env-gated: if NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set, this component
 * renders nothing and the form works without a challenge. The companion
 * server helper at src/lib/server/turnstile.ts is also a no-op in that
 * case. Jason provisions Turnstile + sets both env vars in Vercel when
 * ready; CAPTCHA auto-activates on next deploy.
 *
 * Loads the Turnstile script lazily (only when the widget is mounted).
 * Calls back with the token on success; parent form should pass that
 * token to the API call as `turnstile_token`.
 *
 * Usage:
 *   const [token, setToken] = useState("");
 *
 *   <form onSubmit={(e) => {
 *     e.preventDefault();
 *     submit({ ...formData, turnstile_token: token });
 *   }}>
 *     <TurnstileWidget onToken={setToken} />
 *     <button type="submit" disabled={isTurnstileEnabled() && !token}>
 *       Submit
 *     </button>
 *   </form>
 */

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "vc-turnstile-script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    if (document.getElementById(SCRIPT_ID)) {
      // Already in flight or loaded
      if (window.turnstile) {
        resolve();
      } else {
        // Script tag exists but not yet loaded — wait for its load
        const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement;
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Turnstile script failed to load")),
          { once: true },
        );
      }
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Turnstile script failed to load"));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

export interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  /** Called when the token expires (user idled past the challenge timeout). */
  onExpired?: () => void;
  /** Called on a verification error from Cloudflare. */
  onError?: () => void;
  /** Visual theme. Defaults to "light" to match the warm-editorial palette. */
  theme?: "light" | "dark" | "auto";
}

export function TurnstileWidget({
  onToken,
  onExpired,
  onError,
  theme = "light",
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptError, setScriptError] = useState(false);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          "expired-callback": () => {
            onToken("");
            onExpired?.();
          },
          "error-callback": () => {
            onToken("");
            onError?.();
          },
          theme,
        });
      })
      .catch(() => setScriptError(true));

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore — widget may already be gone
        }
      }
    };
  }, [siteKey, onToken, onExpired, onError, theme]);

  if (!siteKey) {
    // Env-gated off — no widget, form works without a challenge.
    return null;
  }

  if (scriptError) {
    return (
      <p className="text-xs text-vc-danger">
        Bot challenge unavailable. Please refresh and try again.
      </p>
    );
  }

  return <div ref={containerRef} className="my-2" />;
}

/**
 * Helper for forms to know whether to require a token before enabling submit.
 * Returns true only when the env var is set (i.e. CAPTCHA is active).
 */
export function isTurnstileEnabled(): boolean {
  return !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}
