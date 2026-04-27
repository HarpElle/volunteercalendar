/**
 * Admin endpoints for a specific kiosk station.
 *
 *   POST   /api/admin/kiosk/stations/[id]/reissue  body: { church_id }
 *     → generates a new activation code (e.g. lost token, new device)
 *   DELETE /api/admin/kiosk/stations/[id]?church_id=...
 *     → revokes the station and any active token immediately
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { audit, userActor } from "@/lib/server/audit";
import { reissueActivationCode, revokeStation } from "@/lib/server/kiosk";

async function requireOrgAdmin(
  req: NextRequest,
  churchId: string,
): Promise<{ uid: string } | NextResponse> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  const memSnap = await adminDb
    .doc(`memberships/${decoded.uid}_${churchId}`)
    .get();
  if (!memSnap.exists) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  const role = memSnap.data()?.role as string | undefined;
  const status = memSnap.data()?.status as string | undefined;
  if (status !== "active" || !["owner", "admin"].includes(role ?? "")) {
    return NextResponse.json(
      { error: "Only org admins can manage kiosk stations" },
      { status: 403 },
    );
  }
  return { uid: decoded.uid };
}

async function loadStation(stationId: string, churchId: string) {
  const snap = await adminDb.doc(`kiosk_stations/${stationId}`).get();
  if (!snap.exists) return null;
  const data = snap.data() as { church_id?: string };
  if (data.church_id !== churchId) return null;
  return data;
}

/** POST /api/admin/kiosk/stations/[id]  body: { church_id, action: "reissue" } */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { church_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { church_id, action } = body;
  if (!church_id) {
    return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
  }
  if (action !== "reissue") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const auth = await requireOrgAdmin(req, church_id);
  if (auth instanceof NextResponse) return auth;

  try {
    const station = await loadStation(id, church_id);
    if (!station) {
      return NextResponse.json({ error: "Station not found" }, { status: 404 });
    }
    const { code, activation } = await reissueActivationCode({
      station_id: id,
      church_id,
      created_by_uid: auth.uid,
    });
    void audit({
      church_id,
      actor: userActor(auth.uid),
      action: "kiosk.station_reissue_code",
      target_type: "kiosk_station",
      target_id: id,
      outcome: "ok",
    });
    return NextResponse.json({
      activation_code: code,
      activation_expires_at: activation.expires_at,
    });
  } catch (err) {
    console.error("[POST /api/admin/kiosk/stations/:id]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/** DELETE /api/admin/kiosk/stations/[id]?church_id=... */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const churchId = req.nextUrl.searchParams.get("church_id");
  if (!churchId) {
    return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
  }

  const auth = await requireOrgAdmin(req, churchId);
  if (auth instanceof NextResponse) return auth;

  try {
    const station = await revokeStation({
      station_id: id,
      church_id: churchId,
      revoked_by_uid: auth.uid,
    });
    if (!station) {
      return NextResponse.json({ error: "Station not found" }, { status: 404 });
    }
    void audit({
      church_id: churchId,
      actor: userActor(auth.uid),
      action: "kiosk.station_revoke",
      target_type: "kiosk_station",
      target_id: id,
      metadata: { name: station.name },
      outcome: "ok",
    });
    return NextResponse.json({ station });
  } catch (err) {
    console.error("[DELETE /api/admin/kiosk/stations/:id]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
