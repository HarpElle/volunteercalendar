/**
 * Admin endpoints for managing kiosk stations.
 *
 *   GET  /api/admin/kiosk/stations?church_id=...
 *   POST /api/admin/kiosk/stations  body: { church_id, name }
 *
 * Both require an org admin (or owner) for the target church.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { audit, userActor } from "@/lib/server/audit";
import { createStation, listStationsForChurch } from "@/lib/server/kiosk";

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

export async function GET(req: NextRequest) {
  const churchId = req.nextUrl.searchParams.get("church_id");
  if (!churchId) {
    return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
  }
  const auth = await requireOrgAdmin(req, churchId);
  if (auth instanceof NextResponse) return auth;

  try {
    const stations = await listStationsForChurch(churchId);
    return NextResponse.json({ stations });
  } catch (err) {
    console.error("[GET /api/admin/kiosk/stations]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  let body: { church_id?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { church_id, name } = body;
  if (!church_id || !name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid church_id / name" },
      { status: 400 },
    );
  }
  if (name.trim().length > 60) {
    return NextResponse.json(
      { error: "Station name must be 60 characters or fewer" },
      { status: 400 },
    );
  }

  const auth = await requireOrgAdmin(req, church_id);
  if (auth instanceof NextResponse) return auth;

  try {
    const { station, code, activation } = await createStation({
      church_id,
      name: name.trim(),
      created_by_uid: auth.uid,
    });
    void audit({
      church_id,
      actor: userActor(auth.uid),
      action: "kiosk.station_create",
      target_type: "kiosk_station",
      target_id: station.id,
      metadata: { name: station.name },
      outcome: "ok",
    });
    return NextResponse.json({
      station,
      activation_code: code,
      activation_expires_at: activation.expires_at,
    });
  } catch (err) {
    console.error("[POST /api/admin/kiosk/stations]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
