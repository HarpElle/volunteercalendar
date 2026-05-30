/**
 * POST /api/kiosk/activate
 *
 * Public, but rate-limited and gated by an activation code that was generated
 * by an authenticated org admin. The kiosk submits the code; the server
 * consumes it (one-time use) and returns a long-lived station token plus the
 * bound church_id and station_id.
 *
 * Body: { code: string, device_fingerprint?: string }
 * Returns: { token, station: { id, church_id, name } }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { TIER_LIMITS } from "@/lib/constants";
import { rateLimitDistributed } from "@/lib/server/rate-limit";
import { ActivationError, consumeActivation } from "@/lib/server/kiosk";
import { audit, kioskActor } from "@/lib/server/audit";
import type { SubscriptionTier } from "@/lib/types";

export async function POST(req: NextRequest) {
  // Distributed rate limit (Track D.5). 8-char hex code = 16M keyspace, so
  // a brute-force at 30/min would still take ~10 years on average — but the
  // distributed limit ensures a regional fan-out attack can't bypass.
  const limited = await rateLimitDistributed(req, {
    prefix: "kiosk-activate",
    limit: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  let body: { code?: string; device_fingerprint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const codeRaw = body.code;
  if (!codeRaw || typeof codeRaw !== "string") {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }
  const code = codeRaw.trim().toUpperCase();
  if (!/^[0-9A-F]{8}$/.test(code)) {
    return NextResponse.json(
      { error: "Code must be 8 hex characters" },
      { status: 400 },
    );
  }

  const fingerprint =
    typeof body.device_fingerprint === "string"
      ? body.device_fingerprint.slice(0, 200)
      : null;

  try {
    const { token, station, allowed_scopes } = await consumeActivation({
      code,
      device_fingerprint: fingerprint,
    });

    // Pass G Phase 1: tier-gate the target church AFTER activation succeeds.
    // We don't know the church_id until consumeActivation returns, so we
    // can't use the shared `requireModuleTier` helper here (it expects the
    // church_id in the request). Inline the equivalent tier check.
    const churchSnap = await adminDb.doc(`churches/${station.church_id}`).get();
    const tier =
      (churchSnap.data()?.subscription_tier as SubscriptionTier) || "free";
    if (TIER_LIMITS[tier]?.checkin_enabled !== true) {
      return NextResponse.json(
        {
          error: "This feature requires the Growth tier or higher.",
          required_tier: "growth",
          module: "checkin",
        },
        { status: 403 },
      );
    }

    // Wave 4.1: kiosk.activate is a sensitive lifecycle event — a station
    // just successfully traded a one-time code for a long-lived token.
    // Logged after the tier check so denied activations on free orgs don't
    // pollute the feed (those return 403 above without writing this).
    void audit({
      church_id: station.church_id,
      actor: kioskActor(station.id),
      action: "kiosk.activate",
      target_type: "station",
      target_id: station.id,
      metadata: {
        station_name: station.name,
        station_type: station.type ?? "staffed",
        has_fingerprint: fingerprint !== null,
      },
      outcome: "ok",
    });

    return NextResponse.json({
      token,
      station: {
        id: station.id,
        church_id: station.church_id,
        name: station.name,
        // P0-1: surface station type so the kiosk client can render UI
        // affordances appropriate to its capabilities (e.g. hide Check Out
        // on self-service stations).
        type: station.type ?? "staffed",
      },
      // The token's actual scope, server-enforced. The kiosk uses this to
      // decide which buttons/tiles to render. Server still 403s on any
      // out-of-scope request regardless of UI state (defense in depth).
      allowed_scopes,
    });
  } catch (err) {
    if (err instanceof ActivationError) {
      const status =
        err.code === "not_found" ? 404 : err.code === "expired" ? 410 : 409;
      return NextResponse.json({ error: err.code }, { status });
    }
    console.error("[POST /api/kiosk/activate]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
