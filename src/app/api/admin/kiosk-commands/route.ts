/**
 * POST /api/admin/kiosk-commands
 *
 * Admin enqueues a command targeting a specific kiosk station. Today
 * the only supported type is `test_print` (Jason 2026-06-04). The
 * kiosk polls via /api/checkin/kiosk-commands every ~15s, processes
 * pending commands, and reports back via PATCH.
 *
 * Auth: Bearer admin/owner. Verifies the target station belongs to
 * this church.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { audit, userActor } from "@/lib/server/audit";
import type { KioskCommand } from "@/lib/types";

interface PostBody {
  church_id?: string;
  type?: "test_print";
  target_station_id?: string;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const body = (await req.json()) as PostBody;
    const churchId = body.church_id ?? "";
    const targetStationId = body.target_station_id ?? "";
    const type = body.type;

    if (!churchId || !targetStationId) {
      return NextResponse.json(
        { error: "Missing church_id or target_station_id" },
        { status: 400 },
      );
    }
    if (type !== "test_print") {
      return NextResponse.json(
        { error: "Unsupported command type" },
        { status: 400 },
      );
    }

    // Verify membership + role
    const membershipSnap = await adminDb
      .doc(`memberships/${userId}_${churchId}`)
      .get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only owners and admins can send kiosk commands" },
        { status: 403 },
      );
    }

    // Verify the target station belongs to this church + is active.
    const churchRef = adminDb.collection("churches").doc(churchId);
    const stationSnap = await churchRef
      .collection("kiosk_stations")
      .doc(targetStationId)
      .get();
    if (!stationSnap.exists) {
      return NextResponse.json(
        { error: "Target station not found" },
        { status: 404 },
      );
    }
    const stationData = stationSnap.data()!;
    if (stationData.church_id !== churchId) {
      return NextResponse.json(
        { error: "Cross-tenant access denied" },
        { status: 403 },
      );
    }
    if (stationData.status !== "active") {
      return NextResponse.json(
        { error: "Target station is not active" },
        { status: 400 },
      );
    }

    const cmdRef = churchRef.collection("kiosk_commands").doc();
    const now = new Date().toISOString();
    const command: KioskCommand = {
      id: cmdRef.id,
      church_id: churchId,
      type,
      target_station_id: targetStationId,
      status: "pending",
      created_at: now,
      created_by_user_id: userId,
      picked_up_at: null,
      completed_at: null,
      error_message: null,
    };
    await cmdRef.set(command);

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "kiosk.command_enqueued",
      target_type: "kiosk_station",
      target_id: targetStationId,
      metadata: { type, command_id: cmdRef.id },
      outcome: "ok",
    });

    return NextResponse.json({ command }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/admin/kiosk-commands]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
