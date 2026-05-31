/**
 * POST /api/checkin/room-volunteer-checkout
 *
 * Wave 9 P0-5 sub-PR B. Records a volunteer's checkout from a
 * room. Sets `checked_out_at` on the RoomVolunteerCheckIn doc and
 * emits `room.volunteer_checked_out`.
 *
 * Auth: kiosk token with "checkin" scope (same auth surface as
 * the check-in route, intentionally).
 *
 * Body: { church_id, checkin_id }
 *
 * Idempotent: checking out an already-checked-out record is a
 * 200 no-op (no double-audit).
 *
 * Note on related_to symmetry on checkout: when a volunteer leaves,
 * their `related_to` snapshots on OTHER volunteers' docs remain.
 * This is intentional — the snapshot reflects "the room state at
 * the moment of their check-in" and is used for the ratio gate
 * which only counts ACTIVE volunteers anyway (via the
 * `checked_out_at === null` filter on read). A re-check-in goes
 * through the full computeRelatedTo path again.
 *
 * Path-pattern note: flat (no dynamic segments) — see
 * docs/dev/nextjs-16-bundler-bug.md.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { assertKioskChurchMatch, requireKioskToken } from "@/lib/server/authz";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { audit, kioskActor } from "@/lib/server/audit";
import { log } from "@/lib/log";

interface PostBody {
  church_id?: unknown;
  checkin_id?: unknown;
}

export async function POST(req: NextRequest) {
  const kiosk = await requireKioskToken(req, "checkin");
  if (kiosk instanceof NextResponse) return kiosk;

  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const gate = await requireModuleTier(req, "checkin", {
      churchIdFrom: "body",
      allowAnonymous: true,
    });
    if (!gate.ok) return gate.response;
    const { churchId } = gate.ctx;

    const body = (await req.json()) as PostBody;
    const churchIdFromBody =
      typeof body.church_id === "string" ? body.church_id.trim() : "";
    const checkinId =
      typeof body.checkin_id === "string" ? body.checkin_id.trim() : "";

    if (!churchIdFromBody || !checkinId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const churchMismatch = assertKioskChurchMatch(kiosk, churchIdFromBody);
    if (churchMismatch) return churchMismatch;

    const churchRef = adminDb.collection("churches").doc(churchId);
    const ref = churchRef
      .collection("roomVolunteerCheckins")
      .doc(checkinId);

    const checkedOutAt = new Date().toISOString();
    let wroteCheckout = false;
    let personId = "";
    let roomId = "";
    let serviceDate = "";

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("CHECKIN_NOT_FOUND");
      const data = snap.data() ?? {};
      if (data.church_id !== churchId) {
        throw new Error("CROSS_TENANT");
      }
      personId = (data.person_id as string) ?? "";
      roomId = (data.room_id as string) ?? "";
      serviceDate = (data.service_date as string) ?? "";
      if (data.checked_out_at) {
        // Already checked out — idempotent no-op.
        return;
      }
      tx.update(ref, { checked_out_at: checkedOutAt });
      wroteCheckout = true;
    });

    if (wroteCheckout) {
      void audit({
        church_id: churchId,
        actor: kiosk.station_id ? kioskActor(kiosk.station_id) : "kiosk:bootstrap",
        action: "room.volunteer_checked_out",
        target_type: "room_volunteer_checkin",
        target_id: checkinId,
        metadata: {
          room_id: roomId,
          person_id: personId,
          service_date: serviceDate,
        },
        outcome: "ok",
      });
    }

    return NextResponse.json({
      checkin_id: checkinId,
      checked_out_at: wroteCheckout ? checkedOutAt : null,
      already_checked_out: !wroteCheckout,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "CHECKIN_NOT_FOUND") {
        return NextResponse.json(
          { error: "Check-in record not found" },
          { status: 404 },
        );
      }
      if (error.message === "CROSS_TENANT") {
        return NextResponse.json(
          { error: "Cross-tenant access denied" },
          { status: 403 },
        );
      }
    }
    log.error("[POST /api/checkin/room-volunteer-checkout]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
