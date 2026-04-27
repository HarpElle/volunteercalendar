/**
 * Client-side kiosk helpers.
 *
 * - Stores the kiosk's station token + bound church_id in localStorage.
 * - Provides `kioskFetch()` which automatically attaches the X-Kiosk-Token
 *   header. On 401 (token revoked / invalid) it clears local state and
 *   redirects the kiosk to the activation page.
 *
 * localStorage keys:
 *   vc_kiosk_token       — full credential `${tokenId}.${secret}`, set on activation
 *   vc_kiosk_church_id   — church_id this kiosk is bound to
 *   vc_kiosk_station_id  — station_id (for station-aware printer routing)
 *   vc_kiosk_name        — friendly name (existing key, used for printer-station hint)
 *   vc_kiosk_printer     — printer config (existing key)
 */

export const KIOSK_TOKEN_KEY = "vc_kiosk_token";
export const KIOSK_CHURCH_ID_KEY = "vc_kiosk_church_id";
export const KIOSK_STATION_ID_KEY = "vc_kiosk_station_id";

export function getStoredKioskToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KIOSK_TOKEN_KEY);
}

export function getStoredKioskChurchId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KIOSK_CHURCH_ID_KEY);
}

export function getStoredKioskStationId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KIOSK_STATION_ID_KEY);
}

export function setKioskCredentials(opts: {
  token: string;
  church_id: string;
  station_id: string;
}): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KIOSK_TOKEN_KEY, opts.token);
  window.localStorage.setItem(KIOSK_CHURCH_ID_KEY, opts.church_id);
  window.localStorage.setItem(KIOSK_STATION_ID_KEY, opts.station_id);
}

export function clearKioskCredentials(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KIOSK_TOKEN_KEY);
  window.localStorage.removeItem(KIOSK_CHURCH_ID_KEY);
  window.localStorage.removeItem(KIOSK_STATION_ID_KEY);
}

/**
 * Fetch wrapper that automatically attaches the kiosk token. On 401/503 it
 * clears local kiosk credentials and bounces the user to /kiosk so they can
 * re-enroll with a fresh activation code from the admin.
 *
 * Use for all `/api/checkin/*` calls from the kiosk client.
 */
export async function kioskFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = getStoredKioskToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("X-Kiosk-Token", token);

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401 || res.status === 503) {
    // Token is bad / kiosk endpoints disabled. Drop creds and re-enroll.
    clearKioskCredentials();
    if (typeof window !== "undefined") {
      window.location.href = "/kiosk";
    }
  }

  return res;
}
