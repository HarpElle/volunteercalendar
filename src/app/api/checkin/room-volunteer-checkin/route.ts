/**
 * POST /api/checkin/room-volunteer-checkin
 *
 * Wave 9 P0-5 sub-PR B. Records a volunteer's check-in to a room
 * for a service date. Distinct from the children's check-in
 * endpoint (/api/checkin/checkin) — this tracks the ADULTS
 * responsible for a room, which is the population the ratio gate
 * counts.
 *
 * Auth: kiosk token with "checkin" scope. The operator at a
 * staffed kiosk (or a self-service kiosk in self-mode) initiates
 * the check-in by tapping or scanning a volunteer's name. A
 * future PR adds self-check-in via the volunteer's Bearer JWT
 * (W10-2 teacher personal room page).
 *
 * Body: { church_id, room_id, person_id, service_date, source? }
 *
 * Computes `related_to` at check-in time from household overlap
 * with the OTHER active volunteers in the same room + service_date.
 * Persists the snapshot on the doc so a household-membership
 * change after check-in doesn't retroactively flip the gate state.
 *
 * Idempotent: if this volunteer is already actively checked in to
 * this room for this service_date, returns the existing record
 * with status 200 and does NOT double-audit.
 *
 * Path-pattern note: flat (no dynamic segments) so it sits outside
 * the Next.js 16 `[param]/static/[param]` bundler-bug zone — see
 * `docs/dev/nextjs-16-bundler-bug.md`.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { assertKioskChurchMatch, requireKioskToken } from "@/lib/server/authz";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { audit, kioskActor } from "@/lib/server/audit";
import { computeRelatedTo } from "@/lib/server/ratio";
import { log } from "@/lib/log";
import type { RoomVolunteerCheckIn } from "@/lib/types";

interface PostBody {
  church_id?: unknown;
  room_id?: unknown;
  person_id?: unknown;
  service_date?: unknown;
  source?: unknown;
}

const ALLOWED_SOURCES: RoomVolunteerCheckIn["source"][] = [
  "self",
  "operator",
  "system",
];

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
    const roomId =
      typeof body.room_id === "string" ? body.room_id.trim() : "";
    const personId =
      typeof body.person_id === "string" ? body.person_id.trim() : "";
    const serviceDate =
      typeof body.service_date === "string"
        ? body.service_date.trim()
        : "";
    const source =
      typeof body.source === "string" &&
      (ALLOWED_SOURCES as string[]).includes(body.source.trim())
        ? (body.source.trim() as RoomVolunteerCheckIn["source"])
        : "operator";

    if (!churchIdFromBody || !roomId || !personId || !serviceDate) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const churchMismatch = assertKioskChurchMatch(kiosk, churchIdFromBody);
    if (churchMismatch) return churchMismatch;

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Verify room exists in this church.
    const roomSnap = await churchRef.collection("rooms").doc(roomId).get();
    if (!roomSnap.exists) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // Verify person exists + is an active volunteer in this church.
    const personSnap = await churchRef
      .collection("people")
      .doc(personId)
      .get();
    if (!personSnap.exists) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    const personData = personSnap.data() ?? {};
    if (personData.church_id !== churchId) {
      return NextResponse.json(
        { error: "Cross-tenant access denied" },
        { status: 403 },
      );
    }
    if (personData.status !== "active") {
      return NextResponse.json(
        { error: "Volunteer is not active" },
        { status: 400 },
      );
    }
    if (!personData.is_volunteer) {
      return NextResponse.json(
        { error: "Person is not a volunteer" },
        { status: 400 },
      );
    }
    const personHouseholds: string[] = Array.isArray(personData.household_ids)
      ? personData.household_ids
      : [];

    // Idempotency check: if already actively checked in to this room
    // for this service_date, return the existing record without re-
    // computing related_to or re-auditing.
    const existingSnap = await churchRef
      .collection("roomVolunteerCheckins")
      .where("room_id", "==", roomId)
      .where("person_id", "==", personId)
      .where("service_date", "==", serviceDate)
      .get();
    const existingActive = existingSnap.docs.find(
      (d) => (d.data().checked_out_at ?? null) === null,
    );
    if (existingActive) {
      return NextResponse.json({
        checkin: { id: existingActive.id, ...existingActive.data() },
        already_checked_in: true,
      });
    }

    // Load OTHER active volunteers in this room for this service_date
    // (we'll compute related_to against them). Reuses the same query
    // shape as the idempotency check above except without person_id.
    const peerSnap = await churchRef
      .collection("roomVolunteerCheckins")
      .where("room_id", "==", roomId)
      .where("service_date", "==", serviceDate)
      .get();
    const activePeers = peerSnap.docs
      // The data already carries `id` because we write it on creation;
      // skip the doc.id spread to avoid the TS2783 duplicate-key warning.
      .map((d) => d.data() as RoomVolunteerCheckIn)
      .filter((p) => (p.checked_out_at ?? null) === null);

    // Look up household_ids for each peer in a single batch (we need
    // them to feed computeRelatedTo).
    const peerHouseholds = await Promise.all(
      activePeers.map(async (p) => {
        const snap = await churchRef
          .collection("people")
          .doc(p.person_id)
          .get();
        const hh = snap.exists
          ? Array.isArray(snap.data()?.household_ids)
            ? (snap.data()!.household_ids as string[])
            : []
          : [];
        return { person_id: p.person_id, household_ids: hh };
      }),
    );

    const relatedTo = computeRelatedTo(personHouseholds, peerHouseholds);

    // Now: for each peer that's newly related to this volunteer,
    // append THIS volunteer to THEIR related_to as well. The relation
    // is symmetric; we must update both sides so two-deep counting is
    // consistent regardless of check-in order.
    const docRefsToBackfill = activePeers
      .filter((p) => relatedTo.includes(p.person_id))
      .map((p) => churchRef.collection("roomVolunteerCheckins").doc(p.id));

    const newCheckIn: RoomVolunteerCheckIn = {
      id: randomUUID(),
      church_id: churchId,
      room_id: roomId,
      person_id: personId,
      service_date: serviceDate,
      checked_in_at: new Date().toISOString(),
      checked_out_at: null,
      related_to: relatedTo,
      source,
      // The kiosk token doesn't carry an end-user UID; future
      // self-check-in via Bearer will set this to the volunteer's
      // own uid. For operator-mediated check-ins, null is honest.
      recorded_by_user_id: null,
    };

    await adminDb.runTransaction(async (tx) => {
      // Codex P0-5C: Firestore transactions REQUIRE all reads before
      // any writes. The pre-hotfix code did tx.set() followed by
      // tx.get() inside the same tx, which threw and 500'd before
      // the related_to symmetry could be exercised. Hotfix splits
      // the work into two phases.
      //
      // Phase 1 — ALL reads.
      const peerSnaps = await Promise.all(
        docRefsToBackfill.map((ref) => tx.get(ref)),
      );
      // Phase 2 — ALL writes.
      tx.set(
        churchRef
          .collection("roomVolunteerCheckins")
          .doc(newCheckIn.id),
        newCheckIn,
      );
      for (let i = 0; i < docRefsToBackfill.length; i++) {
        const snap = peerSnaps[i];
        if (!snap.exists) continue;
        const current = (snap.data()?.related_to as string[]) ?? [];
        if (!current.includes(personId)) {
          tx.update(docRefsToBackfill[i], {
            related_to: [...current, personId],
          });
        }
      }
    });

    void audit({
      church_id: churchId,
      actor: kiosk.station_id ? kioskActor(kiosk.station_id) : "kiosk:bootstrap",
      action: "room.volunteer_checked_in",
      target_type: "room_volunteer_checkin",
      target_id: newCheckIn.id,
      metadata: {
        room_id: roomId,
        person_id: personId,
        service_date: serviceDate,
        source,
        related_count: relatedTo.length,
      },
      outcome: "ok",
    });

    return NextResponse.json(
      { checkin: newCheckIn, already_checked_in: false },
      { status: 201 },
    );
  } catch (error) {
    log.error("[POST /api/checkin/room-volunteer-checkin]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
