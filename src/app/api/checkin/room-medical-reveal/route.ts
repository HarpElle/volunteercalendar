/**
 * POST /api/checkin/room-medical-reveal
 *
 * Wave 9 P0-4 sub-PR C. Fires the `kiosk.medical_data_revealed`
 * audit when a kiosk operator taps to reveal a `requires_tap`-gated
 * medical field on the room roster. The value itself is already
 * present in the roster response (the audit captures access intent,
 * not value transit — see PR #172 body for the rationale), so this
 * endpoint just records the tap and returns ok.
 *
 * Auth: room view token (same shape as the room GET endpoint).
 * Body: { church_id, room_id, token, session_id, field }
 *
 * Field values are restricted to the three known medical fields so a
 * tampered client can't write garbage into the audit log.
 *
 * Path pattern note: flat at `room-medical-reveal/route.ts` (no
 * dynamic segments) so it sits outside the Next.js 16
 * `[param]/static/[param]` bundler-bug zone described in
 * `docs/dev/nextjs-16-bundler-bug.md`.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { audit } from "@/lib/server/audit";
import { log } from "@/lib/log";

const ALLOWED_FIELDS = ["allergies", "medical_notes", "medications"] as const;

type AllowedField = (typeof ALLOWED_FIELDS)[number];

interface PostBody {
  church_id?: unknown;
  room_id?: unknown;
  token?: unknown;
  session_id?: unknown;
  field?: unknown;
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = (await req.json()) as PostBody;
    const churchId =
      typeof body.church_id === "string" ? body.church_id.trim() : "";
    const roomId = typeof body.room_id === "string" ? body.room_id.trim() : "";
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const sessionId =
      typeof body.session_id === "string" ? body.session_id.trim() : "";
    const field =
      typeof body.field === "string"
        ? (body.field.trim() as AllowedField)
        : "";

    if (!churchId || !roomId || !token || !sessionId || !field) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }
    if (!(ALLOWED_FIELDS as readonly string[]).includes(field)) {
      return NextResponse.json(
        { error: `field must be one of ${ALLOWED_FIELDS.join(", ")}` },
        { status: 400 },
      );
    }

    // Tier gate (parent guardians don't carry org-role membership;
    // allowAnonymous keeps the check fast for room-token-authorized
    // surfaces).
    const shimReq = new NextRequest(
      `${req.nextUrl.origin}${req.nextUrl.pathname}?church_id=${encodeURIComponent(churchId)}`,
      { method: "POST", headers: req.headers },
    );
    const gate = await requireModuleTier(shimReq, "checkin", {
      churchIdFrom: "query",
      allowAnonymous: true,
    });
    if (!gate.ok) return gate.response;

    // Verify the room view token matches the room — same shape as the
    // room GET endpoint.
    const churchRef = adminDb.collection("churches").doc(churchId);
    const roomSnap = await churchRef.collection("rooms").doc(roomId).get();
    if (!roomSnap.exists) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    if (roomSnap.data()?.checkin_view_token !== token) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    void audit({
      church_id: churchId,
      // No kiosk station_id for the room-roster surface — the room
      // view token IS the actor identifier.
      actor: `room_view:${roomId}`,
      action: "kiosk.medical_data_revealed",
      target_type: "checkin_session",
      target_id: sessionId,
      metadata: { field, room_id: roomId },
      outcome: "ok",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error("[POST /api/checkin/room-medical-reveal]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
