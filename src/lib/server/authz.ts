/**
 * Server-side authorization primitives.
 *
 * This module is the single source of truth for who-can-do-what on every
 * non-public API route. Routes call one of the `require*` helpers and either
 * receive the authorized principal or a NextResponse to return immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { verifyKioskToken } from "@/lib/server/kiosk";
import type { KioskScope } from "@/lib/types";
import { log } from "@/lib/log";

// ─── Kiosk token ────────────────────────────────────────────────────────────

export interface KioskPrincipal {
  /** "station" = real per-device token; "bootstrap" = legacy env-var fallback. */
  mode: "station" | "bootstrap";
  /** Bound church_id; clients MUST NOT supply their own. Null in bootstrap mode if env-bound church not set. */
  church_id: string | null;
  station_id: string | null;
  scope: KioskScope[];
}

const ALL_SCOPES: KioskScope[] = [
  "lookup",
  "checkin",
  "checkout",
  "register",
  "print",
  "services",
  "room",
];

/**
 * Verify a kiosk request. Returns the principal on success, or a NextResponse
 * to short-circuit on failure.
 *
 * Resolution order:
 *   1. `X-Kiosk-Token` header in `${tokenId}.${secret}` form — looked up in
 *      Firestore against `kiosk_tokens` (Track B real station auth).
 *   2. `X-Kiosk-Token` matches `KIOSK_BOOTSTRAP_TOKEN` env — emergency
 *      fallback, useful during migrations or as an admin override.
 *   3. Otherwise — 401.
 *
 * If neither real tokens nor a bootstrap secret are configured (i.e. no
 * stations enrolled and `KIOSK_BOOTSTRAP_TOKEN` unset), every kiosk request
 * 401s. That is the intended safe-by-default state — nothing is open until
 * an admin explicitly enrolls a station.
 */
export async function requireKioskToken(
  req: NextRequest,
  scope: KioskScope,
): Promise<KioskPrincipal | NextResponse> {
  const presented = req.headers.get("x-kiosk-token");
  if (!presented) {
    return NextResponse.json(
      { error: "Missing kiosk token. Send X-Kiosk-Token header." },
      { status: 401 },
    );
  }

  // 1. Real station token (Track B): contains a "." separator.
  if (presented.includes(".") && presented.startsWith("kt_")) {
    const verified = await verifyKioskToken(presented);
    if (verified && verified.station.church_id) {
      // Default scope set is broad; reserved for future per-token narrowing.
      const principal: KioskPrincipal = {
        mode: "station",
        church_id: verified.station.church_id,
        station_id: verified.station.id,
        scope: ALL_SCOPES,
      };
      if (!principal.scope.includes(scope)) {
        return NextResponse.json(
          { error: `Token does not authorize ${scope}` },
          { status: 403 },
        );
      }
      return principal;
    }
    // Token format looked right but didn't verify — fall through to 401.
    return NextResponse.json(
      { error: "Invalid kiosk token" },
      { status: 401 },
    );
  }

  // 2. Bootstrap fallback (legacy / emergency).
  const bootstrap = process.env.KIOSK_BOOTSTRAP_TOKEN;
  if (bootstrap) {
    const a = Buffer.from(presented);
    const b = Buffer.from(bootstrap);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return {
        mode: "bootstrap",
        church_id: process.env.KIOSK_BOOTSTRAP_CHURCH_ID ?? null,
        station_id: null,
        scope: ALL_SCOPES,
      };
    }
  }

  return NextResponse.json({ error: "Invalid kiosk token" }, { status: 401 });
}

// ─── Cron secret (Track D.6) ────────────────────────────────────────────────

/**
 * Verify a Vercel cron / internal scheduled request's authorization. Fails
 * closed: if `CRON_SECRET` env var is unset, every cron route 503s. If the
 * presented header is missing or doesn't match, 401. Constant-time compare.
 *
 * Accepts EITHER of two secrets:
 *   - `CRON_SECRET`        — the primary, used by Vercel's scheduled
 *                            cron invocations + any internal automation
 *   - `CODEX_CRON_SECRET`  — optional, separately-rotatable secret for
 *                            Codex's QA harness. Lets Jason share a
 *                            cron-invoke credential without exposing the
 *                            primary, and revoke independently if needed.
 *                            Unset by default; the route works exactly
 *                            as before until the env var is configured.
 *
 * Use at the top of every route under /api/cron/*.
 */
export function requireCronSecret(req: NextRequest): NextResponse | null {
  const primary = process.env.CRON_SECRET;
  if (!primary) {
    return NextResponse.json(
      { error: "Cron not configured (CRON_SECRET env var missing)" },
      { status: 503 },
    );
  }
  const presented =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const presentedBuf = Buffer.from(presented);

  // Constant-time compare against each accepted secret. Loop the full
  // list (not short-circuit on first match) so a timing observer can't
  // tell which secret matched.
  const accepted = [primary];
  const codex = process.env.CODEX_CRON_SECRET;
  if (codex) accepted.push(codex);

  let matched = false;
  for (const candidate of accepted) {
    const candBuf = Buffer.from(candidate);
    if (
      candBuf.length === presentedBuf.length &&
      timingSafeEqual(candBuf, presentedBuf)
    ) {
      matched = true;
      // Don't break — full iteration keeps timing uniform
    }
  }
  if (!matched) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Enforce that the request's church_id matches the kiosk's bound church_id.
 * In bootstrap mode without an env-bound church, falls back to trusting the
 * client (with a server-log warning). With a real station token, the kiosk's
 * bound church is authoritative.
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
    log.warn(
      "Kiosk request used unbound bootstrap token; trusting client church_id. " +
        "Set KIOSK_BOOTSTRAP_CHURCH_ID or migrate to a real station token.",
      { client_church_id: clientChurchId },
    );
  }
  return null;
}
