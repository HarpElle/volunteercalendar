/**
 * POST /api/checkin/pickup-ready
 *
 * Wave 10 (Jason 2026-06-02). Parent signals arrival at the kiosk
 * for pickup. Marks all of the household's still-checked-in sessions
 * for today as pickup_ready — the teacher dashboard then renders a
 * prominent "Ready for pickup" indicator until a teacher
 * acknowledges via /api/teacher/pickup-ack.
 *
 * DISTINCT from /api/checkin/checkout (the actual release). The
 * security-code / wallet-pass flow there remains the authorization
 * gate. This ping is purely communicative — "the family is here,
 * teacher please bring the child out" — for churches whose
 * children's-ministry area is secured and parents can't walk to
 * the classroom.
 *
 * Auth: kiosk station token (X-Kiosk-Token header). Uses the
 * canonical requireKioskToken helper for consistent error shape
 * with the rest of the kiosk routes (Codex 2026-06-02 hotfix
 * fixed the prior auth/body-read ordering bug).
 *
 * Body: { church_id, household_id, service_date? }
 * Response: { sessions_pinged, child_names }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { assertKioskChurchMatch, requireKioskToken } from "@/lib/server/authz";
import { audit, kioskActor } from "@/lib/server/audit";
import type { CheckInSession } from "@/lib/types";

interface PostBody {
  church_id?: string;
  household_id?: string;
  service_date?: string;
}

export async function POST(req: NextRequest) {
  // 1. Kiosk token check FIRST — must run before any body read or
  //    tier check so the right error surfaces when the header is
  //    missing/invalid (Codex hotfix 2026-06-02).
  //
  //    "lookup" scope: this ping just identifies a household; it's
  //    not performing a check-in or checkout. Same rationale used
  //    by /api/checkin/guardian-portal-url. No new KioskScope needed.
  const kiosk = await requireKioskToken(req, "lookup");
  if (kiosk instanceof NextResponse) return kiosk;

  // 2. Rate limit.
  const limited = rateLimit(req, { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  try {
    // 3. Tier gate. churchIdFrom: "body" is required because we
    //    don't pass church_id via URL params. allowAnonymous is on
    //    because the kiosk token IS the auth — the tier gate just
    //    enforces that the org has Check-In enabled.
    const gate = await requireModuleTier(req, "checkin", {
      churchIdFrom: "body",
      allowAnonymous: true,
    });
    if (!gate.ok) return gate.response;
    const { churchId } = gate.ctx;

    // 4. Read body for remaining fields. requireModuleTier already
    //    consumed a clone; this is the first authoritative read.
    const body = (await req.json()) as PostBody;
    const householdId = body.household_id;
    const date =
      body.service_date || new Date().toISOString().split("T")[0];
    if (!householdId) {
      return NextResponse.json(
        { error: "Missing household_id" },
        { status: 400 },
      );
    }

    // 5. Kiosk church-match — prevent a station from one church
    //    triggering pickup pings against another church.
    const churchMismatch = assertKioskChurchMatch(kiosk, churchId);
    if (churchMismatch) return churchMismatch;

    // 6. Bootstrap tokens lack a station_id — pickup-ready needs
    //    an enrolled station so the audit trail can identify which
    //    physical kiosk fired the ping.
    const stationId = kiosk.station_id;
    if (!stationId) {
      return NextResponse.json(
        {
          error:
            "Pickup ready requires an enrolled kiosk station (bootstrap token cannot fire)",
        },
        { status: 403 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(churchId);
    const sessionsSnap = await churchRef
      .collection("checkInSessions")
      .where("household_id", "==", householdId)
      .where("service_date", "==", date)
      .get();

    const openSessions = sessionsSnap.docs.filter((d) => {
      const s = d.data() as CheckInSession;
      return !s.checked_out_at;
    });

    if (openSessions.length === 0) {
      return NextResponse.json({
        sessions_pinged: 0,
        child_names: [],
        message: "No checked-in children to pick up",
      });
    }

    const nowIso = new Date().toISOString();
    const childNames: string[] = [];
    const batch = adminDb.batch();
    for (const sDoc of openSessions) {
      batch.update(sDoc.ref, {
        pickup_ready_at: nowIso,
        pickup_acknowledged_at: null,
        pickup_acknowledged_by: null,
      });
      try {
        const childId = (sDoc.data() as CheckInSession).child_id;
        const childSnap = await churchRef.collection("people").doc(childId).get();
        if (childSnap.exists) {
          const data = childSnap.data() as { preferred_name?: string; first_name?: string };
          childNames.push(data.preferred_name || data.first_name || "Child");
        }
      } catch {
        // skip — don't fail the whole ping over a name lookup error
      }
    }
    await batch.commit();

    void audit({
      church_id: churchId,
      actor: kioskActor(stationId),
      action: "checkin.pickup_ready",
      target_type: "household",
      target_id: householdId,
      metadata: {
        sessions_pinged: openSessions.length,
        service_date: date,
      },
      outcome: "ok",
    });

    return NextResponse.json({
      sessions_pinged: openSessions.length,
      child_names: childNames,
    });
  } catch (err) {
    console.error("[POST /api/checkin/pickup-ready]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
