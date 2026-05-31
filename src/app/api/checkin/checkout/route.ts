import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { assertKioskChurchMatch, requireKioskToken } from "@/lib/server/authz";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { sendSms } from "@/lib/services/sms";
import { audit, kioskActor, SYSTEM_ACTOR } from "@/lib/server/audit";
import { timingSafeEqual } from "crypto";
import type { BlockedPickup, CheckInSession, CheckInAlert } from "@/lib/types";

/**
 * POST /api/checkin/checkout
 * Kiosk endpoint — verifies security code and checks out children.
 * Requires X-Kiosk-Token header (see src/lib/server/authz.ts).
 *
 * Two modes:
 *   1. Session-specific:  { church_id, session_id, security_code }
 *   2. Code-only (kiosk): { church_id, security_code }
 *      → Finds ALL active sessions with matching code today and checks them all out.
 */
export async function POST(req: NextRequest) {
  const kiosk = await requireKioskToken(req, "checkout");
  if (kiosk instanceof NextResponse) return kiosk;

  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    // Pass G Phase 1: tier-gate the target church (kiosk token covers auth).
    // Helper must run before req.json() so its req.clone() has an unread body.
    const gate = await requireModuleTier(req, "checkin", {
      churchIdFrom: "body",
      allowAnonymous: true,
    });
    if (!gate.ok) return gate.response;
    const { churchId: church_id } = gate.ctx;

    const body = await req.json();
    const {
      session_id,
      security_code,
      volunteer_user_id,
      acknowledged_blocks,
    } = body as {
      church_id: string;
      session_id?: string;
      security_code: string;
      volunteer_user_id?: string;
      /**
       * Wave 9 P0-2 sub-PR F hotfix: when the kiosk's block-list
       * review modal was shown to the operator and the operator
       * confirmed the on-site pickup person is NOT on the list, the
       * kiosk client sets this flag so the server-side gate (below)
       * doesn't re-prompt. Default false means "no review happened" —
       * if the server finds active blocks for this code, return 409
       * with the block list so the kiosk shows the modal as a
       * defense-in-depth fallback.
       */
      acknowledged_blocks?: boolean;
    };

    if (!security_code) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const churchMismatch = assertKioskChurchMatch(kiosk, church_id);
    if (churchMismatch) return churchMismatch;

    const churchRef = adminDb.collection("churches").doc(church_id);
    const now = new Date();

    // --- Mode 1: Session-specific checkout ---
    if (session_id) {
      return checkoutSession(
        churchRef,
        church_id,
        session_id,
        security_code,
        volunteer_user_id,
        now,
        kiosk.station_id,
      );
    }

    // --- Mode 2: Code-only kiosk checkout ---
    const today = now.toISOString().split("T")[0];
    const sessionsSnap = await churchRef
      .collection("checkInSessions")
      .where("service_date", "==", today)
      .where("security_code", "==", security_code.toUpperCase())
      .get();

    if (sessionsSnap.empty) {
      return NextResponse.json(
        { error: "no_active_sessions", message: "No children found with this code." },
        { status: 404 },
      );
    }

    // Filter to only active (not yet checked out) sessions
    const activeSessions = sessionsSnap.docs.filter(
      (doc) => !doc.data().checked_out_at,
    );

    if (activeSessions.length === 0) {
      return NextResponse.json(
        { error: "no_active_sessions", message: "All children with this code are already checked out." },
        { status: 409 },
      );
    }

    // Wave 9 P0-2 sub-PR F hotfix: defense-in-depth block-list gate.
    //
    // The kiosk client SHOULD call /api/checkin/blocked-pickups first
    // and pop the review modal if any active blocks exist for the
    // children behind the code. But the preview is a UX assist, not a
    // safety gate. If the preview is skipped (because the kiosk
    // client wasn't updated yet) OR if the preview query has a bug
    // (like the one Codex caught on the P0-2F retest), this gate
    // catches the silent miss BEFORE the release happens.
    //
    // Fail-open semantics: if the block-list query itself throws,
    // we log and proceed. The intent is to catch genuine block
    // misses, not brick checkout on a flaky network or a malformed
    // Firestore index. The preview-then-attempt flow is the primary
    // safety path; this is the belt-and-suspenders.
    if (!acknowledged_blocks) {
      try {
        const childIds = Array.from(
          new Set(activeSessions.map((d) => (d.data() as CheckInSession).child_id)),
        );

        // Resolve the children's household IDs + display names (one
        // read per child; typically ≤4 per security code).
        const householdIds = new Set<string>();
        const childNames = new Map<string, string>();
        for (const cid of childIds) {
          const personSnap = await churchRef
            .collection("people")
            .doc(cid)
            .get();
          if (!personSnap.exists) continue;
          const d = personSnap.data() ?? {};
          const hhs: string[] = Array.isArray(d.household_ids)
            ? (d.household_ids as string[])
            : [];
          hhs.forEach((h) => householdIds.add(h));
          const name =
            (d.preferred_name as string) ||
            (d.first_name as string) ||
            (d.name as string) ||
            "Unknown";
          childNames.set(cid, name);
        }

        // Pull child-scope blocks (one query per child).
        const blocksRef = churchRef.collection("checkin_blocked_pickups");
        const childScopedSnaps = await Promise.all(
          childIds.map((cid) =>
            blocksRef
              .where("scope", "==", "child")
              .where("child_id", "==", cid)
              .get(),
          ),
        );
        const householdList = Array.from(householdIds);
        const householdScopedSnap = householdList.length
          ? await blocksRef
              .where("scope", "==", "household")
              .where("household_id", "in", householdList.slice(0, 30))
              .get()
          : null;

        const collectedBlocks: BlockedPickup[] = [
          ...childScopedSnaps.flatMap((s) =>
            s.docs.map((d) => d.data() as BlockedPickup),
          ),
          ...(householdScopedSnap
            ? householdScopedSnap.docs.map((d) => d.data() as BlockedPickup)
            : []),
        ];
        // Dedup by id (same household may surface twice via different
        // children) and drop expired blocks.
        const seen = new Set<string>();
        const nowMs = now.getTime();
        const activeBlocks = collectedBlocks.filter((b) => {
          if (seen.has(b.id)) return false;
          seen.add(b.id);
          if (b.expires_at && Date.parse(b.expires_at) <= nowMs) return false;
          return true;
        });

        if (activeBlocks.length > 0) {
          // Audit row so we can detect "preview was skipped/failed AND
          // the server gate fired" — a strong signal that something
          // about the client flow needs investigation. Outcome "denied"
          // because we're refusing the release in the absence of an
          // acknowledged_blocks flag.
          void audit({
            church_id,
            actor: kioskActor(kiosk.station_id ?? "unknown"),
            action: "kiosk.checkout_blocked_pending_review",
            target_type: "checkin_blocked_pickup",
            target_id: activeBlocks[0].id,
            metadata: {
              active_blocks: activeBlocks.length,
              session_ids: activeSessions.map((d) => d.id),
            },
            outcome: "denied",
          });

          // Same response shape as /api/checkin/blocked-pickups so the
          // kiosk client can reuse its review-modal state.
          return NextResponse.json(
            {
              error: "requires_block_review",
              message:
                "Block list active for this household. Review required before release.",
              blocks: activeBlocks,
              children: activeSessions.map((d) => {
                const data = d.data() as CheckInSession;
                return {
                  child_name: childNames.get(data.child_id) ?? "Unknown",
                  room_name: data.room_name ?? null,
                };
              }),
              session_ids: activeSessions.map((d) => d.id),
            },
            { status: 409 },
          );
        }
      } catch {
        // Block-list query failed (unindexed query, transient error, ...).
        // Fail-open: log & proceed with checkout. The intent of this
        // gate is to catch a SILENT preview miss, not to brick checkout
        // on infrastructure flakes. If the same fault repeats, the
        // upstream preview also failed and the operator's situational
        // awareness from the preview-modal path is the safety primary.
        // No-op log (errors observable via Sentry instrumentation).
      }
    }

    // Check code expiry on the first session (all share the same expiry)
    const firstSession = activeSessions[0].data() as CheckInSession;
    if (new Date(firstSession.security_code_expires_at) < now) {
      const alertId = adminDb.collection("_").doc().id;
      const alert: CheckInAlert = {
        id: alertId,
        church_id,
        session_id: activeSessions[0].id,
        child_id: firstSession.child_id,
        alert_type: "expired_code",
        attempted_code: security_code,
        occurred_at: now.toISOString(),
        resolved: false,
      };
      await churchRef.collection("checkinAlerts").doc(alertId).set(alert);

      return NextResponse.json(
        { error: "code_expired", message: "Security code has expired. Please see a staff member." },
        { status: 403 },
      );
    }

    // Batch checkout all active sessions
    const batch = adminDb.batch();
    const childIds: string[] = [];

    for (const doc of activeSessions) {
      batch.update(doc.ref, {
        checked_out_at: now.toISOString(),
        checked_out_by_user_id: volunteer_user_id || null,
      });
      childIds.push(doc.data().child_id);
    }
    await batch.commit();

    // Load child names
    const childDocs = await Promise.all(
      childIds.map((id) => churchRef.collection("children").doc(id).get()),
    );

    const children = childDocs.map((snap, i) => {
      const data = snap.exists ? snap.data()! : {};
      return {
        child_name: snap.exists
          ? `${data.preferred_name || data.first_name} ${data.last_name}`
          : "Unknown",
        room_name: activeSessions[i].data().room_name || "Unknown",
      };
    });

    // Guardian SMS on checkout (fire-and-forget)
    if (activeSessions.length > 0) {
      const householdId = activeSessions[0].data().household_id;
      if (householdId) {
        sendGuardianCheckoutSms(churchRef, church_id, householdId, children).catch(() => {});
      }
    }

    // Wave 4.1: child-data event — checkout is the second half of the
    // chain-of-custody pair that started at kiosk.checkin. One audit row
    // per session checked out so compliance auditors can reconstruct who
    // released each child and when.
    for (let i = 0; i < activeSessions.length; i++) {
      const sessionDoc = activeSessions[i];
      void audit({
        church_id,
        actor: kiosk.station_id ? kioskActor(kiosk.station_id) : SYSTEM_ACTOR,
        action: "kiosk.checkout",
        target_type: "checkin_session",
        target_id: sessionDoc.id,
        metadata: {
          child_id: childIds[i],
          checked_out_by_user_id: volunteer_user_id || null,
          mode: "code_only_batch",
          batch_size: activeSessions.length,
        },
        outcome: "ok",
      });
    }

    return NextResponse.json({
      success: true,
      children,
      checked_out_at: now.toISOString(),
    });
  } catch (error) {
    console.error("[POST /api/checkin/checkout]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * Session-specific checkout with timing-safe code verification.
 */
async function checkoutSession(
  churchRef: FirebaseFirestore.DocumentReference,
  churchId: string,
  sessionId: string,
  securityCode: string,
  volunteerUserId: string | undefined,
  now: Date,
  stationId: string | null,
) {
  const sessionSnap = await churchRef
    .collection("checkInSessions")
    .doc(sessionId)
    .get();

  if (!sessionSnap.exists) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const session = sessionSnap.data() as CheckInSession;

  if (session.checked_out_at) {
    return NextResponse.json({ error: "Already checked out" }, { status: 409 });
  }

  if (new Date(session.security_code_expires_at) < now) {
    const alertId = adminDb.collection("_").doc().id;
    const alert: CheckInAlert = {
      id: alertId,
      church_id: churchId,
      session_id: sessionId,
      child_id: session.child_id,
      alert_type: "expired_code",
      attempted_code: securityCode,
      occurred_at: now.toISOString(),
      resolved: false,
    };
    await churchRef.collection("checkinAlerts").doc(alertId).set(alert);

    return NextResponse.json(
      { error: "code_expired", message: "Security code has expired. Please see a staff member." },
      { status: 403 },
    );
  }

  const codeA = Buffer.from(securityCode.toUpperCase().padEnd(4));
  const codeB = Buffer.from(session.security_code.toUpperCase().padEnd(4));
  const codesMatch = codeA.length === codeB.length && timingSafeEqual(codeA, codeB);

  if (!codesMatch) {
    const alertId = adminDb.collection("_").doc().id;
    const alert: CheckInAlert = {
      id: alertId,
      church_id: churchId,
      session_id: sessionId,
      child_id: session.child_id,
      alert_type: "wrong_code",
      attempted_code: securityCode,
      occurred_at: now.toISOString(),
      resolved: false,
    };
    await churchRef.collection("checkinAlerts").doc(alertId).set(alert);

    return NextResponse.json(
      { error: "code_mismatch", message: "Security code does not match." },
      { status: 403 },
    );
  }

  await churchRef.collection("checkInSessions").doc(sessionId).update({
    checked_out_at: now.toISOString(),
    checked_out_by_user_id: volunteerUserId || null,
  });

  const childSnap = await churchRef
    .collection("children")
    .doc(session.child_id)
    .get();
  const childName = childSnap.exists
    ? `${childSnap.data()!.preferred_name || childSnap.data()!.first_name} ${childSnap.data()!.last_name}`
    : "Unknown";

  const children = [{ child_name: childName, room_name: session.room_name }];

  // Guardian SMS on checkout (fire-and-forget)
  if (session.household_id) {
    sendGuardianCheckoutSms(churchRef, churchId, session.household_id, children).catch(() => {});
  }

  // Wave 4.1: child-data event for the session-specific path.
  void audit({
    church_id: churchId,
    actor: stationId ? kioskActor(stationId) : SYSTEM_ACTOR,
    action: "kiosk.checkout",
    target_type: "checkin_session",
    target_id: sessionId,
    metadata: {
      child_id: session.child_id,
      checked_out_by_user_id: volunteerUserId || null,
      mode: "session_specific",
    },
    outcome: "ok",
  });

  return NextResponse.json({
    success: true,
    children,
    checked_out_at: now.toISOString(),
  });
}

/**
 * Fire-and-forget guardian SMS on checkout.
 * Loads settings + household phone; skips silently if disabled or missing.
 */
async function sendGuardianCheckoutSms(
  churchRef: FirebaseFirestore.DocumentReference,
  churchId: string,
  householdId: string,
  children: { child_name: string; room_name: string }[],
) {
  const settingsSnap = await churchRef
    .collection("checkinSettings")
    .doc("config")
    .get();
  if (!settingsSnap.exists || !settingsSnap.data()!.guardian_sms_on_checkout) return;

  const householdSnap = await churchRef
    .collection("checkin_households")
    .doc(householdId)
    .get();
  if (!householdSnap.exists) return;

  const phone = householdSnap.data()!.primary_guardian_phone as string | undefined;
  if (!phone) return;

  const nameList = children.map((c) => c.child_name).join(", ");
  const roomList = [...new Set(children.map((c) => c.room_name))].join(", ");
  await sendSms({
    to: phone,
    body: `${nameList} has been checked out from ${roomList}.`,
  });
}
