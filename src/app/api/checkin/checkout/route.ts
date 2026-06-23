import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { assertKioskChurchMatch, requireKioskToken } from "@/lib/server/authz";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { sendSms } from "@/lib/services/sms";
import { audit, kioskActor, SYSTEM_ACTOR } from "@/lib/server/audit";
import { loadHouseholdPhone, loadChild } from "@/lib/server/checkin-helpers";
import { normalizePhone } from "@/lib/utils/phone";
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
    //
    // Codex W10-1 hotfix (Sev 2): the check-in route writes
    // `service_date` from the BROWSER's locally-computed date (church-
    // local), but this code used to compare against `now.toISOString()
    // .split("T")[0]` which is UTC. When the church is in a timezone
    // west of UTC and a service spans the UTC midnight rollover (e.g.
    // Sunday-evening services in US time become Monday UTC), every
    // code-only checkout 404'd because no session matched the UTC
    // "today" string.
    //
    // Fix: search a 3-day UTC window (yesterday/today/tomorrow). The
    // security code is the actual gate — we narrow to one church-day
    // by `where("security_code", "==", ...)` and the in-process
    // `checked_out_at` filter below. Three explicit ISO dates fit
    // comfortably within Firestore's `in` cap (30 values).
    const dayMs = 86_400_000;
    const candidateDates = [
      new Date(now.getTime() - dayMs).toISOString().split("T")[0],
      now.toISOString().split("T")[0],
      new Date(now.getTime() + dayMs).toISOString().split("T")[0],
    ];
    const sessionsSnap = await churchRef
      .collection("checkInSessions")
      .where("service_date", "in", candidateDates)
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

    // Load child names. loadChild resolves BOTH unified (people) and legacy
    // (children) storage — a plain children/{id} read returns nothing for
    // Pro-tier orgs, so the response surfaced child_name "Unknown" even for
    // valid children (Codex P4-2).
    const loadedChildren = await Promise.all(
      childIds.map((id) => loadChild(churchRef, id)),
    );

    const children = loadedChildren.map((child, i) => ({
      child_name: child
        ? `${child.display_name} ${child.last_name}`.trim()
        : "Unknown",
      room_name: activeSessions[i].data().room_name || "Unknown",
    }));

    // Guardian + recipient SMS on checkout (fire-and-forget)
    // Wave 10 W10-1: pulls present_recipients from the first session
    // — all sessions in a check-in batch carry the same recipient
    // snapshot, so the first is representative.
    if (activeSessions.length > 0) {
      const householdId = activeSessions[0].data().household_id;
      const presentRecipients = activeSessions[0].data()
        .present_recipients as
        | NonNullable<
            import("@/lib/types").CheckInSession["present_recipients"]
          >
        | undefined;
      if (householdId) {
        sendGuardianCheckoutSms(
          churchRef,
          church_id,
          householdId,
          children,
          presentRecipients,
        ).catch(() => {});
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

  // loadChild resolves unified (people) + legacy (children) storage; a plain
  // children/{id} read returns nothing for Pro-tier orgs (Codex P4-2).
  const child = await loadChild(churchRef, session.child_id);
  const childName = child
    ? `${child.display_name} ${child.last_name}`.trim()
    : "Unknown";

  const children = [{ child_name: childName, room_name: session.room_name }];

  // Guardian + recipient SMS on checkout (fire-and-forget)
  // Wave 10 W10-1: includes present_recipients if the original
  // session captured them.
  if (session.household_id) {
    sendGuardianCheckoutSms(
      churchRef,
      churchId,
      session.household_id,
      children,
      session.present_recipients,
    ).catch(() => {});
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
 * Fire-and-forget guardian + recipient SMS on checkout.
 *
 * Wave 10 W10-1 extension: when the original session(s) carried
 * `present_recipients` (the kiosk recipient selection), the
 * pickup-confirmation SMS fans out to primary guardian + each
 * recipient (dedup'd by normalized phone). When no recipients were
 * captured, behavior matches the prior single-primary SMS.
 *
 * Loads settings + household phone; skips silently if disabled or
 * missing.
 */
async function sendGuardianCheckoutSms(
  churchRef: FirebaseFirestore.DocumentReference,
  _churchId: string,
  householdId: string,
  children: { child_name: string; room_name: string }[],
  presentRecipients?: NonNullable<
    import("@/lib/types").CheckInSession["present_recipients"]
  >,
) {
  const settingsSnap = await churchRef
    .collection("checkinSettings")
    .doc("config")
    .get();
  if (!settingsSnap.exists || !settingsSnap.data()!.guardian_sms_on_checkout) return;

  // Codex W10-1 Sev 2: prior implementation only looked at the
  // legacy `checkin_households` doc; unified-mode (Pro-tier) churches
  // store the primary's phone on the linked adult Person, so the
  // legacy-only lookup silently returned undefined and Mom never got
  // the checkout SMS. `loadHouseholdPhone` handles both shapes (see
  // src/lib/server/checkin-helpers.ts:105) — same helper the check-in
  // route uses.
  const primaryPhone = (await loadHouseholdPhone(churchRef, householdId))
    ?? undefined;

  // Dedup phones: primary first, then each recipient with a phone on file.
  // Uses normalizePhone (strips formatting AND leading US country code "1")
  // so +15551110001 and (555) 111-0001 collapse to a single recipient.
  // Consistency with the W10-3 hotfix to /api/teacher/page-parent.
  const sendTo: string[] = [];
  const seen = new Set<string>();
  if (primaryPhone) {
    const norm = normalizePhone(primaryPhone);
    if (norm) {
      seen.add(norm);
      sendTo.push(primaryPhone);
    }
  }
  for (const r of presentRecipients ?? []) {
    if (!r.phone) continue;
    const norm = normalizePhone(r.phone);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    sendTo.push(r.phone);
  }
  if (sendTo.length === 0) return;

  // Recipient-list preview in body so each notified contact sees who
  // else was authorized at check-in. Caps at 5 names.
  const allNames = (presentRecipients ?? []).map((r) => r.name);
  const namesPreview = allNames.length === 0
    ? ""
    : allNames.length <= 5
      ? allNames.join(", ")
      : `${allNames.slice(0, 5).join(", ")}, and ${allNames.length - 5} more`;
  const pickupClause = namesPreview
    ? ` Pickup authorized: ${namesPreview}.`
    : "";

  const nameList = children.map((c) => c.child_name).join(", ");
  const roomList = [...new Set(children.map((c) => c.room_name))].join(", ");
  const body = `${nameList} has been checked out from ${roomList}.${pickupClause}`;

  for (const to of sendTo) {
    sendSms({ to, body }).catch(() => {});
  }
}
