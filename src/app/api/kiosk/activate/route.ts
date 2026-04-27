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
import { rateLimit } from "@/lib/utils/rate-limit";
import { ActivationError, consumeActivation } from "@/lib/server/kiosk";

export async function POST(req: NextRequest) {
  // Generous limit; activation should be infrequent. Tighter than nothing
  // because an attacker could brute-force 8-hex-char codes.
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
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
    const { token, station } = await consumeActivation({
      code,
      device_fingerprint: fingerprint,
    });
    return NextResponse.json({
      token,
      station: {
        id: station.id,
        church_id: station.church_id,
        name: station.name,
      },
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
