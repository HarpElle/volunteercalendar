/**
 * Blocked-pickup attempt — kiosk records that a person on the block
 * list attempted to take a child home.
 *
 * Wave 9 P0-2 sub-PR F. The legally material event. Triggered when the
 * operator at a staffed station, after reviewing the block-list panel
 * (see /api/checkin/blocked-pickups), confirms that the on-site
 * pickup person matches an entry on the list.
 *
 * Behavior:
 *   1. Validate the kiosk token + church match + tier gate.
 *   2. Audit `kiosk.blocked_pickup_attempted` with the blocked_pickup_id +
 *      session_ids + actor (the kiosk station).
 *   3. Fan out SMS notifications:
 *      a. Church owner (looked up from memberships where role == "owner")
 *      b. Every Emergency Response Team contact configured on
 *         CheckInSettings.emergency_notification_numbers
 *   4. Audit `kiosk.ert_notified` per recipient.
 *
 * The release is NOT performed. The kiosk UI shows a blocking alert
 * and the session stays "checked_in" until an owner manually unblocks
 * (delete the block list entry via admin UI) and the parent retries.
 *
 * Auth: requires a staffed-station X-Kiosk-Token (same scope as
 * /api/checkin/checkout). Per-station scope was narrowed in P0-1.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import {
  assertKioskChurchMatch,
  requireKioskToken,
} from "@/lib/server/authz";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { sendSms } from "@/lib/services/sms";
import { audit, kioskActor } from "@/lib/server/audit";
import { log } from "@/lib/log";
import type {
  BlockedPickup,
  CheckInSettings,
} from "@/lib/types";

interface PostBody {
  church_id?: unknown;
  security_code?: unknown;
  blocked_pickup_id?: unknown;
  notes?: unknown;
}

export async function POST(req: NextRequest) {
  const kiosk = await requireKioskToken(req, "checkout");
  if (kiosk instanceof NextResponse) return kiosk;

  const limited = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const gate = await requireModuleTier(req, "checkin", {
      churchIdFrom: "body",
      allowAnonymous: true,
    });
    if (!gate.ok) return gate.response;

    const body = (await req.json()) as PostBody;
    const churchId =
      typeof body.church_id === "string" ? body.church_id.trim() : "";
    const securityCode =
      typeof body.security_code === "string"
        ? body.security_code.trim().toUpperCase()
        : "";
    const blockedPickupId =
      typeof body.blocked_pickup_id === "string"
        ? body.blocked_pickup_id.trim()
        : "";
    const operatorNotes =
      typeof body.notes === "string" && body.notes.trim().length > 0
        ? body.notes.trim().slice(0, 500)
        : null;

    if (!churchId) {
      return NextResponse.json(
        { error: "church_id is required" },
        { status: 400 },
      );
    }
    if (!securityCode) {
      return NextResponse.json(
        { error: "security_code is required" },
        { status: 400 },
      );
    }
    if (!blockedPickupId) {
      return NextResponse.json(
        { error: "blocked_pickup_id is required" },
        { status: 400 },
      );
    }

    const mismatch = assertKioskChurchMatch(kiosk, churchId);
    if (mismatch) return mismatch;

    // Verify the block-list entry exists in this church.
    const blockSnap = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("checkin_blocked_pickups")
      .doc(blockedPickupId)
      .get();
    if (!blockSnap.exists) {
      return NextResponse.json(
        { error: "Blocked-pickup entry not found" },
        { status: 404 },
      );
    }
    const block = blockSnap.data() as BlockedPickup;
    if (block.church_id !== churchId) {
      return NextResponse.json(
        { error: "Cross-tenant access denied" },
        { status: 403 },
      );
    }

    // Find the matching session(s) for the security code.
    const today = new Date().toISOString().split("T")[0];
    const sessionsSnap = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("checkInSessions")
      .where("security_code", "==", securityCode)
      .where("service_date", "==", today)
      .where("status", "==", "checked_in")
      .get();
    const sessionIds = sessionsSnap.docs.map((d) => d.id);

    // Pull check-in settings to get the ERT list.
    const settingsSnap = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("checkinSettings")
      .doc("config")
      .get();
    const settings = settingsSnap.exists
      ? (settingsSnap.data() as CheckInSettings)
      : null;
    const ertNumbers = settings?.emergency_notification_numbers ?? [];

    // Pull the church doc for the friendly name in SMS body.
    const churchDoc = await adminDb.doc(`churches/${churchId}`).get();
    const churchName =
      (churchDoc.data()?.name as string | undefined) ?? "Your church";

    // Find the owner(s) of this church via the memberships collection.
    const ownersSnap = await adminDb
      .collection("memberships")
      .where("church_id", "==", churchId)
      .where("role", "==", "owner")
      .where("status", "==", "active")
      .get();
    const ownerUids = ownersSnap.docs.map(
      (d) => d.data().user_id as string | undefined,
    );

    // For each owner, look up their phone on the user doc.
    const ownerPhones: string[] = [];
    for (const uid of ownerUids) {
      if (!uid) continue;
      const userSnap = await adminDb.doc(`users/${uid}`).get();
      if (!userSnap.exists) continue;
      const phone = userSnap.data()?.phone as string | undefined;
      if (phone) ownerPhones.push(phone);
    }

    // Compose the SMS body.
    const stationLabel = `kiosk:${(kiosk.station_id ?? "unknown").slice(0, 6)}`;
    const smsBody = `[${churchName} ALERT] Blocked-pickup attempt at check-in (${stationLabel}). Person on the block list (${block.name}, reason: ${block.reason.replace("_", " ")}) attempted to take a child home. Release was BLOCKED. Open the dashboard to review and respond.`;

    // Audit the attempt FIRST so we have the trail even if SMS fails.
    void audit({
      church_id: churchId,
      actor: kioskActor(kiosk.station_id ?? "unknown"),
      action: "kiosk.blocked_pickup_attempted",
      target_type: "checkin_blocked_pickup",
      target_id: blockedPickupId,
      metadata: {
        block_scope: block.scope,
        block_reason: block.reason,
        attempted_pickup_name: block.name,
        session_ids: sessionIds,
        operator_notes: operatorNotes,
        owner_recipients: ownerPhones.length,
        ert_recipients: ertNumbers.length,
      },
      outcome: "ok",
    });

    // Fire SMS to owners + ERT in parallel. Per-recipient audit row
    // for the trail.
    const recipients: { name: string; phone: string; kind: "owner" | "ert"; role: string | null }[] = [
      ...ownerPhones.map((p) => ({
        name: "Owner",
        phone: p,
        kind: "owner" as const,
        role: null,
      })),
      ...ertNumbers.map((e) => ({
        name: e.name,
        phone: e.phone,
        kind: "ert" as const,
        role: e.role,
      })),
    ];

    const smsResults = await Promise.allSettled(
      recipients.map(async (r) => {
        const res = await sendSms({ to: r.phone, body: smsBody });
        void audit({
          church_id: churchId,
          actor: kioskActor(kiosk.station_id ?? "unknown"),
          action: "kiosk.ert_notified",
          target_type: "checkin_blocked_pickup",
          target_id: blockedPickupId,
          metadata: {
            recipient_kind: r.kind,
            recipient_role: r.role,
            sms_success: res.success,
            sms_error: res.error,
            // Phone is intentionally NOT logged here — PII. Reference IDs only.
          },
          outcome: res.success ? "ok" : "failed",
        });
        return res;
      }),
    );

    const fanout_success = smsResults.filter(
      (r) => r.status === "fulfilled" && r.value.success,
    ).length;
    const fanout_failed = smsResults.length - fanout_success;

    return NextResponse.json(
      {
        blocked: true,
        message:
          "Blocked-pickup attempt recorded. Owner and Emergency Response Team have been notified.",
        attempt_audit: "kiosk.blocked_pickup_attempted",
        fanout: {
          attempted: recipients.length,
          success: fanout_success,
          failed: fanout_failed,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    log.error("[POST /api/checkin/blocked-pickup-attempt]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
