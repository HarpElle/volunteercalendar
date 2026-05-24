/**
 * Admin endpoints for managing kiosk stations.
 *
 *   GET  /api/admin/kiosk/stations?church_id=...
 *   POST /api/admin/kiosk/stations  body: { church_id, name }
 *
 * Both require an org admin (or owner) for the target church.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { audit, userActor } from "@/lib/server/audit";
import { createStation, listStationsForChurch } from "@/lib/server/kiosk";

/**
 * Preserve the original `status === "active"` membership check that the
 * shared helper does not enforce. Helper already verified user is a member
 * and gave us their role; here we confirm the membership is active.
 */
async function assertActiveMembership(
  userId: string,
  churchId: string,
  role: string,
): Promise<NextResponse | null> {
  const memSnap = await adminDb
    .doc(`memberships/${userId}_${churchId}`)
    .get();
  const status = memSnap.data()?.status as string | undefined;
  if (status !== "active" || !["owner", "admin"].includes(role)) {
    return NextResponse.json(
      { error: "Only org admins can manage kiosk stations" },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleTier(req, "checkin");
  if (!gate.ok) return gate.response;
  const { userId, churchId, role } = gate.ctx;

  const block = await assertActiveMembership(userId, churchId, role);
  if (block) return block;

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
  const gate = await requireModuleTier(req, "checkin", {
    churchIdFrom: "body",
  });
  if (!gate.ok) return gate.response;
  const { userId, churchId, role } = gate.ctx;

  const block = await assertActiveMembership(userId, churchId, role);
  if (block) return block;

  let body: { church_id?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name } = body;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
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

  try {
    const { station, code, activation } = await createStation({
      church_id: churchId,
      name: name.trim(),
      created_by_uid: userId,
    });
    void audit({
      church_id: churchId,
      actor: userActor(userId),
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
