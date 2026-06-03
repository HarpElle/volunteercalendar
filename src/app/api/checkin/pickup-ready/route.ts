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
 * Auth: kiosk station token (X-Kiosk-Token header).
 * Body: { church_id, household_id, service_date? }
 * Response: { sessions_pinged, child_names }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { audit, kioskActor } from "@/lib/server/audit";
import type { CheckInSession } from "@/lib/types";

interface PostBody {
  church_id?: string;
  household_id?: string;
  service_date?: string;
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const gate = await requireModuleTier(req, "checkin", {
      allowAnonymous: true,
    });
    if (!gate.ok) return gate.response;

    const body = (await req.json()) as PostBody;
    const churchId = body.church_id;
    const householdId = body.household_id;
    const date =
      body.service_date || new Date().toISOString().split("T")[0];
    if (!churchId || !householdId) {
      return NextResponse.json(
        { error: "Missing church_id or household_id" },
        { status: 400 },
      );
    }

    const kioskToken = req.headers.get("X-Kiosk-Token");
    if (!kioskToken) {
      return NextResponse.json(
        { error: "Missing X-Kiosk-Token" },
        { status: 401 },
      );
    }
    const stationsSnap = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("kiosk_stations")
      .where("token", "==", kioskToken)
      .limit(1)
      .get();
    if (stationsSnap.empty) {
      return NextResponse.json({ error: "Invalid kiosk token" }, { status: 401 });
    }
    const stationId = stationsSnap.docs[0].id;

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
        // skip
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
