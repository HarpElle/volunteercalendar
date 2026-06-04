/**
 * PATCH /api/checkin/kiosk-commands/[id]
 *
 * Kiosk reports the result of executing a command. The kiosk must
 * own the command (target_station_id === its station). The route
 * accepts status="completed" or "failed" with an optional
 * error_message.
 *
 * Auth: kiosk station token. Bootstrap tokens are rejected — only
 * enrolled stations can mutate command state.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { requireKioskToken } from "@/lib/server/authz";
import { audit, kioskActor } from "@/lib/server/audit";
import type { KioskCommand } from "@/lib/types";

interface PatchBody {
  status?: "completed" | "failed";
  error_message?: string | null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const kiosk = await requireKioskToken(req, "lookup");
  if (kiosk instanceof NextResponse) return kiosk;

  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  if (!kiosk.station_id || !kiosk.church_id) {
    return NextResponse.json(
      { error: "Enrolled station required" },
      { status: 403 },
    );
  }

  try {
    const { id: commandId } = await params;
    const body = (await req.json()) as PatchBody;

    if (body.status !== "completed" && body.status !== "failed") {
      return NextResponse.json(
        { error: "status must be 'completed' or 'failed'" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(kiosk.church_id);
    const cmdRef = churchRef.collection("kiosk_commands").doc(commandId);
    const snap = await cmdRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 });
    }
    const cmd = snap.data() as KioskCommand;
    if (cmd.target_station_id !== kiosk.station_id) {
      return NextResponse.json(
        { error: "Command is not for this station" },
        { status: 403 },
      );
    }
    if (cmd.status !== "pending") {
      return NextResponse.json(
        { error: "Command is no longer pending" },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    await cmdRef.update({
      status: body.status,
      completed_at: now,
      error_message:
        typeof body.error_message === "string"
          ? body.error_message.slice(0, 500)
          : null,
    });

    void audit({
      church_id: kiosk.church_id,
      actor: kioskActor(kiosk.station_id),
      action:
        body.status === "completed"
          ? "kiosk.command_completed"
          : "kiosk.command_failed",
      target_type: "kiosk_command",
      target_id: commandId,
      metadata: {
        type: cmd.type,
        error_message: body.error_message ?? null,
      },
      outcome: body.status === "completed" ? "ok" : "failed",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/checkin/kiosk-commands/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
