/**
 * Server-side authorization primitives.
 *
 * This module is the single source of truth for who-can-do-what on every
 * non-public API route. Routes call one of the `require*` helpers and either
 * receive the authorized principal or a NextResponse to return immediately.
 *
 * Migration status:
 *   - requireKioskToken: STUB — uses a single shared bootstrap token from env
 *     (KIOSK_BOOTSTRAP_TOKEN). Track B replaces this with per-station tokens
 *     in the `kiosk_tokens` Firestore collection.
 *   - Other helpers (requireUser, requireMembership, requireCronSecret,
 *     requirePlatformAdmin, requireStripeWebhook) land in track D.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

// ─── Kiosk token (Track B placeholder) ──────────────────────────────────────

export type KioskScope =
  | "lookup"
  | "checkin"
  | "checkout"
  | "register"
  | "print"
  | "services"
  | "room";

export interface KioskPrincipal {
  /** Bootstrap mode uses a single shared token; per-station tokens come in track B. */
  mode: "bootstrap" | "station";
  /** Bound church_id; clients MUST NOT supply their own. */
  church_id: string | null;
  /** Optional station id (track B). */
  station_id: string | null;
  /** Allowed actions. Bootstrap mode grants all scopes for backward compat. */
  scope: KioskScope[];
}

/**
 * Verify a kiosk request. Returns the principal on success, or a NextResponse
 * to short-circuit on failure.
 *
 * Today (track A): rejects unless `X-Kiosk-Token` matches
 * `process.env.KIOSK_BOOTSTRAP_TOKEN`. If the env var is unset, ALL kiosk
 * routes 401 — the safe default.
 *
 * The bootstrap token's church_id binding comes from
 * `process.env.KIOSK_BOOTSTRAP_CHURCH_ID`. Set this on Vercel alongside the
 * token. If unset, the principal's church_id is null and routes must reject
 * any request that requires a bound church.
 */
export function requireKioskToken(
  req: NextRequest,
  _scope: KioskScope, // currently unused; track B enforces per-scope
): KioskPrincipal | NextResponse {
  const presented = req.headers.get("x-kiosk-token");
  const expected = process.env.KIOSK_BOOTSTRAP_TOKEN;

  if (!expected) {
    // Fail closed: if the env var is unset, kiosk routes are disabled.
    return NextResponse.json(
      { error: "Kiosk endpoints disabled (KIOSK_BOOTSTRAP_TOKEN not configured)" },
      { status: 503 },
    );
  }

  if (!presented) {
    return NextResponse.json(
      { error: "Missing kiosk token. Send X-Kiosk-Token header." },
      { status: 401 },
    );
  }

  // Constant-time comparison
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json(
      { error: "Invalid kiosk token" },
      { status: 401 },
    );
  }

  return {
    mode: "bootstrap",
    church_id: process.env.KIOSK_BOOTSTRAP_CHURCH_ID ?? null,
    station_id: null,
    scope: [
      "lookup",
      "checkin",
      "checkout",
      "register",
      "print",
      "services",
      "room",
    ],
  };
}

/**
 * Convenience: enforce that the request's church_id (from body/query) matches
 * the kiosk's bound church_id. In bootstrap mode where the env-bound church
 * is not set, this falls back to trusting the client (the legacy behavior),
 * but logs a warning. Track B removes the fallback.
 */
export function assertKioskChurchMatch(
  principal: KioskPrincipal,
  clientChurchId: string | undefined | null,
): NextResponse | null {
  if (!clientChurchId) {
    return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
  }
  if (principal.church_id && principal.church_id !== clientChurchId) {
    return NextResponse.json(
      { error: "Kiosk not authorized for this church" },
      { status: 403 },
    );
  }
  if (!principal.church_id) {
    // Bootstrap mode without bound church — log + allow. Track B removes this.
    console.warn(
      "[authz] Kiosk request used unbound bootstrap token; trusting client church_id. " +
        "Set KIOSK_BOOTSTRAP_CHURCH_ID in production.",
    );
  }
  return null;
}
