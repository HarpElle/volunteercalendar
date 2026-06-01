import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { assertKioskChurchMatch, requireKioskToken } from "@/lib/server/authz";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { audit, kioskActor } from "@/lib/server/audit";
import {
  assignRoomByGrade,
  loadChild,
  loadHouseholdPhone,
} from "@/lib/server/checkin-helpers";
import {
  filterSnapshotForLabel,
  resolveMedicalVisibility,
} from "@/lib/server/medical-visibility";
import {
  canCheckInOneMore,
  DEFAULT_RATIO_WARNING_PERCENT,
  type RatioEvaluation,
} from "@/lib/server/ratio";
import { generateSecurityCode } from "@/lib/utils/security-code";
import { getPrinterAdapter } from "@/lib/services/printing";
import { sendSms } from "@/lib/services/sms";
import { getBaseUrl } from "@/lib/utils/base-url";
import type {
  CheckInSession,
  CheckInSettings,
  LabelJob,
  LabelPayload,
  PrinterConfig,
  Room,
  RoomVolunteerCheckIn,
} from "@/lib/types";

/**
 * POST /api/checkin/checkin
 * Kiosk endpoint — checks in children and generates label payloads.
 * Requires X-Kiosk-Token header (see src/lib/server/authz.ts).
 */
export async function POST(req: NextRequest) {
  const kiosk = await requireKioskToken(req, "checkin");
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
      household_id,
      child_ids,
      room_overrides,
      station_id,
      service_date,
      service_id,
      alerts_acknowledged,
    } = body as {
      church_id: string;
      household_id: string;
      child_ids: string[];
      room_overrides?: Record<string, string>;
      station_id?: string;
      service_date: string;
      service_id?: string;
      alerts_acknowledged?: boolean;
    };

    if (!household_id || !child_ids?.length || !service_date) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const churchMismatch = assertKioskChurchMatch(kiosk, church_id);
    if (churchMismatch) return churchMismatch;

    const churchRef = adminDb.collection("churches").doc(church_id);

    // Load church doc for name (helper already verified existence)
    const churchSnap = await churchRef.get();
    const churchName = churchSnap.data()!.name as string;

    // Load check-in settings for printer config + service times
    const settingsSnap = await churchRef
      .collection("checkinSettings")
      .doc("config")
      .get();
    const settings = settingsSnap.exists ? settingsSnap.data()! : null;

    // Load household for guardian phone (used for SMS). Use the unified-aware
    // helper so SMS works for Pro-tier orgs (where the household lives in
    // `households` and the phone lives on the linked adult Person).
    let guardianPhone: string | null = null;
    let isFirstSms = false;
    if (settings?.guardian_sms_on_checkin) {
      guardianPhone = await loadHouseholdPhone(churchRef, household_id);
      // For unified households we don't track `first_sms_sent` yet; default to
      // true so we don't ever send a duplicate vCard link.
      const legacySnap = await churchRef
        .collection("checkin_households")
        .doc(household_id)
        .get();
      if (legacySnap.exists) {
        isFirstSms = !legacySnap.data()!.first_sms_sent;
      }
    }

    // Find the printer for this station
    let printerConfig: PrinterConfig | null = null;
    if (settings?.printers?.length) {
      const printers = settings.printers as PrinterConfig[];
      if (station_id) {
        printerConfig =
          printers.find((p) => p.id === station_id && p.is_active) || null;
      }
      if (!printerConfig) {
        printerConfig = printers.find((p) => p.is_active) || null;
      }
    }

    // Calculate security code expiry (service end time + 2hr, or end of day)
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setHours(23, 59, 59, 999); // Default: end of day
    // If we have service times, use the latest end time + 2hr
    if (settings?.service_times?.length) {
      const dayOfWeek = new Date(service_date + "T12:00:00").getDay();
      const todayServices = (
        settings.service_times as { day_of_week: number; end_time: string; is_active: boolean }[]
      ).filter(
        (st) => st.day_of_week === dayOfWeek && st.is_active,
      );
      if (todayServices.length) {
        const latestEnd = todayServices
          .map((st) => st.end_time)
          .sort()
          .pop()!;
        const [h, m] = latestEnd.split(":").map(Number);
        expiresAt.setHours(h + 2, m, 0, 0);
      }
    }

    // Generate one shared security code for this check-in group
    const securityCode = generateSecurityCode();

    // Process each child
    const sessions: CheckInSession[] = [];
    const labelPayloads: LabelPayload[] = [];
    const childNames: string[] = [];
    const alreadyCheckedIn: string[] = [];
    let anyAlerts = false;
    // Wave 9 P0-5 sub-PR C: ratio gate state.
    //
    // - `ratioBlocked` collects child_ids that hit a violation without an
    //   override. The kiosk UI shows these as "blocked — room over ratio"
    //   alongside the alreadyCheckedIn list.
    // - `ratioByRoom` caches per-room state we'd otherwise re-fetch
    //   across the loop (volunteers + active child count).
    // - `batchAddsByRoom` tracks intra-batch increments so a 3-child
    //   batch that lands all 3 in the same room counts each successive
    //   add toward the gate (otherwise child #3 would be evaluated with
    //   stale state).
    // - The X-Ratio-Override header is one-shot per request and only
    //   honored when the kiosk is provably a staffed station — looked
    //   up below when the first violation hits, then cached.
    const ratioOverrideHeader =
      req.headers.get("x-ratio-override")?.trim() === "true";
    // Codex P0-5C Sev 4: response carries the same blocked_reason
    // string that the audit row metadata gets. Lets kiosk UI render
    // distinct copy for the three reasons without re-deriving from
    // the message.
    const ratioBlocked: Array<{
      child_id: string;
      ratio: RatioEvaluation;
      blocked_reason:
        | "no_override"
        | "self_service_station_cannot_override"
        | "race_detected";
    }> = [];
    const ratioByRoom = new Map<
      string,
      {
        roomDoc: Pick<Room, "ratio_policy">;
        baseChildCount: number;
        volunteers: Pick<RoomVolunteerCheckIn, "person_id" | "related_to">[];
      }
    >();
    const batchAddsByRoom = new Map<string, number>();
    let stationIsStaffed: boolean | null = null;
    // Codex P0-5C Sev 4: tracks whether the staffed-station override
    // was actually CONSUMED (not just requested via the header). Lets
    // the batch-level kiosk.checkin audit row carry the flag so
    // compliance can scan "which batches used the override."
    let ratioOverrideUsed = false;

    for (const childId of child_ids) {
      // Handle both unified Person docs (Pro tier) and legacy children docs.
      // Before this change, the legacy-only lookup silently skipped Person
      // IDs, which is why kiosk check-ins for unified-mode orgs never
      // created sessions even though the kiosk UI showed success.
      const child = await loadChild(churchRef, childId);
      if (!child) continue;

      // Idempotency (Codex Wave 7 Row 5): if this child already has an active
      // (not-checked-out) session for this service_date, skip — a repeated
      // check-in must NOT create a second session / security code. Query is two
      // equality filters (index-safe); checked_out_at is filtered in-memory
      // since the per-child/date result set is tiny.
      const existingSessions = await churchRef
        .collection("checkInSessions")
        .where("child_id", "==", childId)
        .where("service_date", "==", service_date)
        .get();
      const hasActiveSession = existingSessions.docs.some(
        (d) => (d.data().checked_out_at ?? null) === null,
      );
      if (hasActiveSession) {
        alreadyCheckedIn.push(childId);
        continue;
      }

      // Resolve room. Precedence:
      //   1. Operator override (per-child selection on the kiosk)
      //   2. The child's preset default_room_id
      //   3. Grade-based assignment from configured room.default_grades
      //   4. Unassigned
      // Step 3 fixes the case where a child has a grade but no preset room
      // (Add Child UI doesn't collect default_room_id), so previously every
      // such child landed in "Unassigned" regardless of room configuration.
      let roomId: string | null =
        room_overrides?.[childId] || child.default_room_id || null;
      let roomName = "Unassigned";
      let roomCapacity: number | undefined;
      let overflowRoomId: string | undefined;

      if (roomId) {
        const roomSnap = await churchRef.collection("rooms").doc(roomId).get();
        if (roomSnap.exists) {
          const roomData = roomSnap.data()!;
          roomName = roomData.name;
          roomCapacity = roomData.capacity;
          overflowRoomId = roomData.overflow_room_id;
        }
      } else if (child.grade) {
        const matched = await assignRoomByGrade(
          churchRef,
          child.grade,
          service_date,
        );
        if (matched) {
          roomId = matched.id;
          roomName = matched.name;
          roomCapacity = matched.capacity;
          overflowRoomId = matched.overflow_room_id;
        }
      }

      // Check room capacity + auto-redirect to overflow if available
      if (roomId && roomCapacity) {
        // Codex P0-5C: no .where("checked_out_at", "==", null)
        // because Firestore null-equality doesn't match missing
        // fields. In-process filter is defense-in-depth even for
        // legacy sessions created before this commit added the
        // explicit `null` write on creation.
        const capacitySnap = await churchRef
          .collection("checkInSessions")
          .where("service_date", "==", service_date)
          .where("room_id", "==", roomId)
          .get();
        const count = capacitySnap.docs.filter(
          (d) => (d.data().checked_out_at ?? null) === null,
        ).length;

        if (count >= roomCapacity) {
          // Auto-redirect to overflow room if configured
          if (overflowRoomId) {
            const overflowSnap = await churchRef
              .collection("rooms")
              .doc(overflowRoomId)
              .get();
            if (overflowSnap.exists) {
              roomId = overflowRoomId;
              roomName = overflowSnap.data()!.name;
            }
          }

          // Capacity SMS (non-blocking)
          if (settings?.capacity_sms_recipient_phone) {
            await sendSms({
              to: settings.capacity_sms_recipient_phone,
              body: `[${churchName}] Check-In: ${roomName} has reached capacity (${count}/${roomCapacity}). Consider redirecting. – VolunteerCal`,
            }).catch(() => {});
          }
        }
      }

      // Per-child deferred-warning carrier. Set to { ratio_message }
      // when the pre-check returns a warning band; emitted as
      // `kiosk.ratio_warning_shown` AFTER the session write succeeds
      // inside the transactional re-check (race-safe).
      let pendingWarningAudit: { ratio_message: string } | null = null;

      // ────────────────────────────────────────────────────────────
      // Wave 9 P0-5 sub-PR C: ratio gate. Evaluates the volunteer-to-
      // child ratio for the FINAL roomId (after capacity-overflow has
      // potentially redirected) and either blocks, warns, or passes.
      //
      // Violation → block unless X-Ratio-Override header is set AND
      // the kiosk is a staffed station. Override emits
      // `kiosk.ratio_violation_override` audit (legally material).
      //
      // Warning → allow but emit `kiosk.ratio_warning_shown` so the
      // platform monitoring can surface the "how often does this church
      // bump the warning" signal.
      //
      // Skipped silently when the final room has no `ratio_policy` or
      // policy is disabled — matches the helper's bypass semantics.
      // ────────────────────────────────────────────────────────────
      if (roomId) {
        let ratioState = ratioByRoom.get(roomId);
        if (!ratioState) {
          const finalRoomSnap = await churchRef
            .collection("rooms")
            .doc(roomId)
            .get();
          const finalRoomDoc = finalRoomSnap.exists
            ? (finalRoomSnap.data() as Room)
            : null;
          if (finalRoomDoc?.ratio_policy?.enabled) {
            // Codex P0-5C: same pattern — no .where(checked_out_at,null);
            // count via in-process filter to tolerate any legacy
            // sessions missing the explicit null.
            const baseSessionsSnap = await churchRef
              .collection("checkInSessions")
              .where("service_date", "==", service_date)
              .where("room_id", "==", roomId)
              .get();
            const baseChildCount = baseSessionsSnap.docs.filter(
              (d) => (d.data().checked_out_at ?? null) === null,
            ).length;
            const volSnap = await churchRef
              .collection("roomVolunteerCheckins")
              .where("room_id", "==", roomId)
              .where("service_date", "==", service_date)
              .get();
            const activeVolunteers = volSnap.docs
              .map((d) => d.data() as RoomVolunteerCheckIn)
              .filter((v) => (v.checked_out_at ?? null) === null);
            ratioState = {
              roomDoc: { ratio_policy: finalRoomDoc.ratio_policy },
              baseChildCount,
              volunteers: activeVolunteers,
            };
            ratioByRoom.set(roomId, ratioState);
          }
        }

        if (ratioState) {
          const warningPercent =
            (settings?.ratio_warning_threshold_percent as
              | number
              | undefined) ?? DEFAULT_RATIO_WARNING_PERCENT;
          const prevAdds = batchAddsByRoom.get(roomId) ?? 0;
          const ratio = canCheckInOneMore(
            ratioState.roomDoc,
            ratioState.baseChildCount + prevAdds,
            ratioState.volunteers,
            warningPercent,
          );

          if (ratio.status === "violation") {
            // Resolve staffed-station status lazily — only when the first
            // violation actually fires. Caches across the rest of the batch.
            if (stationIsStaffed === null) {
              if (kiosk.station_id) {
                // Codex P0-5C: stations live at the top-level
                // `kiosk_stations` collection (see src/lib/server/
                // kiosk.ts), NOT a per-church subcollection. The
                // pre-hotfix lookup at churchRef.collection(
                // "kioskStations") always returned not-exists, so
                // every override-with-header attempt fell through
                // the !stationIsStaffed branch and 403'd even on
                // legitimately staffed stations.
                const stationSnap = await adminDb
                  .doc(`kiosk_stations/${kiosk.station_id}`)
                  .get();
                stationIsStaffed =
                  stationSnap.exists &&
                  stationSnap.data()?.type === "staffed";
              } else {
                // Bootstrap mode (no real station) — treat as
                // staffed for back-compat. Real production deployments
                // use real station tokens; bootstrap exists for admin
                // migrations.
                stationIsStaffed = true;
              }
            }

            const overrideAllowed = ratioOverrideHeader && stationIsStaffed;
            if (!overrideAllowed) {
              const blockedReason: "self_service_station_cannot_override" | "no_override" =
                ratioOverrideHeader
                  ? "self_service_station_cannot_override"
                  : "no_override";
              ratioBlocked.push({
                child_id: childId,
                ratio,
                blocked_reason: blockedReason,
              });
              void audit({
                church_id,
                actor: kiosk.station_id
                  ? kioskActor(kiosk.station_id)
                  : "kiosk:bootstrap",
                action: "kiosk.checkin",
                target_type: "checkin_attempt",
                target_id: childId,
                metadata: {
                  room_id: roomId,
                  service_date,
                  ratio_status: "violation",
                  blocked_reason: blockedReason,
                  ratio_message: ratio.message,
                },
                outcome: "denied",
              });
              continue;
            }

            // Override path — allow + emit the legally-material audit.
            ratioOverrideUsed = true;
            void audit({
              church_id,
              actor: kiosk.station_id
                ? kioskActor(kiosk.station_id)
                : "kiosk:bootstrap",
              action: "kiosk.ratio_violation_override",
              target_type: "checkin_attempt",
              target_id: childId,
              metadata: {
                room_id: roomId,
                service_date,
                ratio_message: ratio.message,
                station_id: kiosk.station_id,
              },
              outcome: "ok",
            });
          } else if (ratio.status === "warning") {
            // Codex P0-5C race-fix: defer the warning-audit emission
            // until AFTER the session write succeeds inside the
            // transactional re-check below. If the tx detects a race
            // and blocks the write, we don't want to claim "warning
            // shown" for a child that didn't actually check in —
            // that would mix a "delivered" audit with a "denied"
            // audit on the same target.
            pendingWarningAudit = { ratio_message: ratio.message };
          }
        }
      }
      // Tracks whether this iteration is in race-protected-write mode
      // (ratio_policy enabled on the final room) — used below to
      // decide between transactional and bare write.
      const roomHasRatioPolicy =
        roomId !== null && ratioByRoom.has(roomId);

      const displayName = child.preferred_name || child.first_name;
      const fullName = `${displayName} ${child.last_name}`;
      childNames.push(displayName);

      // Codex P0-5C race-of-race fix: batchAddsByRoom is incremented
      // AFTER a successful session write, NOT here. The earlier
      // placement double-counted the in-flight child inside the
      // transactional re-check below: pre-check used (counter - 0),
      // tx used (counter + 1) which then passed +1 internally to
      // canCheckInOneMore, blocking child 6 of a 7-child batch as
      // race_detected even when there was no concurrency.

      if (child.has_alerts) anyAlerts = true;

      // Create CheckInSession document
      const sessionId = adminDb
        .collection("_")
        .doc().id;
      // Wave 9 P0-4: dual-write structured medical_snapshot alongside
      // the legacy concatenated alert_snapshot string. Downstream
      // surfaces (kiosk roster, label generator, reports) read the
      // structured field with `CheckInSettings.medical_visibility`
      // applied; legacy readers that haven't migrated keep working
      // off alert_snapshot for one release window.
      //
      // Note: `(child as { medications?: string }).medications` reads
      // the new field whether the child doc has it or not. Legacy
      // docs without `medications` resolve to null; new docs that
      // populate it (Sub-PR B form work) include it.
      const childMedications =
        (child as { medications?: string }).medications ?? null;
      const session: CheckInSession = {
        id: sessionId,
        church_id,
        child_id: childId,
        household_id,
        service_date,
        ...(service_id ? { service_id } : {}),
        room_id: roomId || "",
        room_name: roomName,
        security_code: securityCode,
        security_code_expires_at: expiresAt.toISOString(),
        checked_in_at: now.toISOString(),
        // Codex P0-5C race-of-race-fix root cause: Firestore
        // `where('checked_out_at', '==', null)` ONLY matches docs
        // that HAVE the field set to null — docs where the field is
        // absent are excluded. Pre-fix, this code created sessions
        // WITHOUT checked_out_at, so the live-count queries
        // returned 0 even when active sessions existed. The race-
        // detect tx therefore never saw a violation; final count
        // 9/6 observed by Codex. Writing the field explicitly on
        // creation makes the queries match correctly. (The 4 query
        // sites are also switched to no-filter + in-process filtering
        // as defense-in-depth for any legacy session docs.)
        checked_out_at: null,
        pre_checked_in: false,
        alerts_acknowledged: !!alerts_acknowledged,
        ...(child.has_alerts
          ? {
              alert_snapshot: [
                child.allergies,
                child.medical_notes,
                childMedications,
              ]
                .filter(Boolean)
                .join(" | "),
              medical_snapshot: {
                allergies: child.allergies ?? null,
                medical_notes: child.medical_notes ?? null,
                medications: childMedications,
              },
            }
          : {}),
        created_at: now.toISOString(),
      };

      // ────────────────────────────────────────────────────────────
      // Codex P0-5C race-fix (Sev 3): transactional write that re-
      // counts children for the room INSIDE the same Firestore
      // transaction. Closes the concurrent-batch overrun the prior
      // Codex retest documented (final count 7/6 observed in the
      // production harness).
      //
      // The pre-check above uses a cached `ratioByRoom` snapshot +
      // intra-batch counter — fast path that catches most cases.
      // But if a CONCURRENT batch from another kiosk writes a
      // session between our pre-check and our write, the cached
      // state is stale and a child that should fail might pass.
      // The tx re-reads the live count and re-evaluates the gate
      // with the volunteers cached (volunteers don't change during
      // a single check-in batch — only other room-volunteer-check-in
      // routes write them, which are rare relative to children
      // check-ins).
      //
      // No-ratio-policy rooms skip the tx — saves the round-trip on
      // the common case and matches the helper's bypass semantics.
      // ────────────────────────────────────────────────────────────
      let raceBlocked = false;
      let raceBlockedRatio: import("@/lib/server/ratio").RatioEvaluation | null = null;
      if (roomHasRatioPolicy) {
        const ratioState = ratioByRoom.get(roomId!)!;
        const warningPercentInner =
          (settings?.ratio_warning_threshold_percent as
            | number
            | undefined) ?? DEFAULT_RATIO_WARNING_PERCENT;
        // Codex P0-5C race-of-race fix: the prior tx read the
        // checkInSessions query + wrote a new session doc. Two
        // concurrent tx targeting the SAME room+date queried the
        // SAME virtual collection but wrote DIFFERENT doc IDs —
        // so the writes didn't conflict, Firestore committed both,
        // and the room overran (Codex observed final count 9/6).
        //
        // The fix: tx.get() + tx.set() the SAME deterministic lock
        // doc per room+date. Two concurrent tx now read the same
        // doc version + both try to set it on commit; Firestore's
        // optimistic concurrency aborts the loser, which retries
        // with the new state and either passes or fails the gate.
        //
        // The lock doc has no semantically-meaningful content —
        // it's purely a serialization point. We stamp it with the
        // last check-in timestamp so the write is non-trivial
        // (avoids any potential Firestore no-op optimization), and
        // the doc itself doubles as a debug breadcrumb.
        const lockDocRef = churchRef
          .collection("roomCheckinLocks")
          .doc(`${roomId!}_${service_date}`);

        await adminDb.runTransaction(async (tx) => {
          // Phase 1A: tx.get() the lock doc to register read interest.
          // Two concurrent tx that both read this doc + both write to
          // it will conflict on commit; one wins, the other retries.
          await tx.get(lockDocRef);

          // Phase 1B: read live child count INSIDE the tx so a retry
          // sees the winner's session.
          // Codex P0-5C: same fix — drop the where(checked_out_at,null)
          // filter (Firestore null-equality doesn't match missing
          // fields, so the prior query returned 0 sessions even when
          // active sessions existed — observed by Codex as final
          // count 9/6). The session-create code now writes the field
          // explicitly, and the in-process filter is defense for any
          // legacy session docs.
          const liveSnap = await tx.get(
            churchRef
              .collection("checkInSessions")
              .where("service_date", "==", service_date)
              .where("room_id", "==", roomId!),
          );
          // liveSnap reflects all sessions (active + checked-out) for
          // the room+date. Filter in-process for the active count.
          const liveCount = liveSnap.docs.filter(
            (d) => (d.data().checked_out_at ?? null) === null,
          ).length;
          const recheck = canCheckInOneMore(
            ratioState.roomDoc,
            liveCount,
            ratioState.volunteers,
            warningPercentInner,
          );
          if (recheck.status === "violation") {
            // Race detected. Same override semantics as the pre-check:
            // staffed station + header = pass, else block.
            const overrideAllowed = ratioOverrideHeader && stationIsStaffed;
            if (!overrideAllowed) {
              raceBlocked = true;
              raceBlockedRatio = recheck;
              return;
            }
            ratioOverrideUsed = true;
          }

          // Phase 2: writes. Session + lock-doc bump in the same tx
          // so concurrent retries see the new state on next read.
          tx.set(
            churchRef.collection("checkInSessions").doc(sessionId),
            session,
          );
          tx.set(
            lockDocRef,
            { last_checkin_at: now.toISOString(), room_id: roomId, service_date },
            { merge: true },
          );
        });
      } else {
        // No ratio policy — bare write, no tx needed.
        await churchRef
          .collection("checkInSessions")
          .doc(sessionId)
          .set(session);
      }

      if (raceBlocked) {
        // The tx detected a race and refused the write. Treat as a
        // standard ratio block: surface in ratio_blocked, emit a
        // denied audit (with a race-specific reason), and skip the
        // label + bookkeeping path for this child. The pre-check
        // had not yet emitted a warning audit (we deferred it), so
        // there's no contradictory audit row to worry about.
        ratioBlocked.push({
          child_id: childId,
          ratio: raceBlockedRatio!,
          blocked_reason: "race_detected",
        });
        void audit({
          church_id,
          actor: kiosk.station_id
            ? kioskActor(kiosk.station_id)
            : "kiosk:bootstrap",
          action: "kiosk.checkin",
          target_type: "checkin_attempt",
          target_id: childId,
          metadata: {
            room_id: roomId,
            service_date,
            ratio_status: "violation",
            blocked_reason: "race_detected",
            ratio_message: raceBlockedRatio!.message,
          },
          outcome: "denied",
        });
        continue;
      }

      // Session committed successfully — emit any deferred audit and
      // record the session.
      if (pendingWarningAudit) {
        void audit({
          church_id,
          actor: kiosk.station_id
            ? kioskActor(kiosk.station_id)
            : "kiosk:bootstrap",
          action: "kiosk.ratio_warning_shown",
          target_type: "checkin_attempt",
          target_id: childId,
          metadata: {
            room_id: roomId,
            service_date,
            ratio_message: pendingWarningAudit.ratio_message,
          },
          outcome: "ok",
        });
      }
      sessions.push(session);
      // Codex P0-5C race-of-race fix: bump the per-room batch counter
      // ONLY after a successful, non-race-blocked write. The counter
      // is now only consumed by the PRE-CHECK fast path (the
      // transactional re-check above uses the live snap directly), so
      // a slightly-stale counter is acceptable here — the tx will
      // catch any drift. But incrementing only after success ensures
      // we never count an in-flight child against itself.
      if (roomId && roomHasRatioPolicy) {
        batchAddsByRoom.set(roomId, (batchAddsByRoom.get(roomId) ?? 0) + 1);
      }

      // Generate child label
      if (printerConfig) {
        // Wave 9 P0-4 sub-PR B: apply per-field visibility to the
        // label. Today's adapters only render allergies on the
        // physical label, so we gate the `allergy_text` field on
        // `visibility.allergies.label`. The medical_notes /
        // medications gating is forward-compatible — when adapters
        // add fields, the filtered snapshot already carries the
        // correct nulls.
        const visibility = resolveMedicalVisibility(
          settings as Pick<CheckInSettings, "medical_visibility"> | null,
        );
        const labelSnapshot = filterSnapshotForLabel(
          {
            allergies: child.allergies ?? null,
            medical_notes: child.medical_notes ?? null,
            medications: childMedications,
          },
          visibility,
        );
        const labelJob: LabelJob = {
          type: "child_label",
          child_name: fullName,
          room_name: roomName,
          service_date: formatDateForLabel(service_date),
          security_code: securityCode,
          church_name: churchName,
          // has_allergy_alert stays driven by whether the child has
          // ANY medical surface — so the visual ⚠ indicator on the
          // label still appears even when the text is hidden by
          // visibility config. The alert presence is not PII; the
          // text content is.
          has_allergy_alert: child.has_alerts,
          allergy_text: labelSnapshot.allergies || undefined,
        };
        try {
          const adapter = getPrinterAdapter(printerConfig.printer_type);
          const payload = await adapter.generateLabel(labelJob, printerConfig);
          labelPayloads.push(payload);
        } catch {
          // Label generation failure — non-blocking
        }
      }
    }

    // Generate parent stub (one per family group)
    if (printerConfig && childNames.length > 0) {
      const stubJob: LabelJob = {
        type: "parent_stub",
        child_names: childNames,
        service_date: formatDateForLabel(service_date),
        security_code: securityCode,
        church_name: churchName,
        has_allergy_alert: anyAlerts,
      };
      try {
        const adapter = getPrinterAdapter(printerConfig.printer_type);
        const payload = await adapter.generateLabel(stubJob, printerConfig);
        labelPayloads.push(payload);
      } catch {
        // Non-blocking
      }
    }

    // Guardian SMS — fire-and-forget (non-blocking)
    if (settings?.guardian_sms_on_checkin && guardianPhone) {
      const roomList = [...new Set(sessions.map((s) => s.room_name))].join(", ");
      const nameList = childNames.join(", ");
      let smsBody = `${nameList} checked in to ${roomList}. Security code: ${securityCode}`;

      // On first SMS, append vCard download link so guardian can save the contact
      if (isFirstSms) {
        const origin = getBaseUrl(req);
        smsBody += ` Save this contact: ${origin}/api/checkin/vcard?church_id=${church_id}`;
      }

      sendSms({ to: guardianPhone, body: smsBody }).catch(() => {});

      // Mark first SMS sent (fire-and-forget)
      if (isFirstSms) {
        churchRef
          .collection("checkin_households")
          .doc(household_id)
          .update({ first_sms_sent: true })
          .catch(() => {});
      }
    }

    void audit({
      church_id,
      actor: kiosk.station_id ? kioskActor(kiosk.station_id) : "kiosk:bootstrap",
      action: "kiosk.checkin",
      target_type: "checkin_session_batch",
      target_id: household_id,
      metadata: {
        service_date,
        ...(service_id ? { service_id } : {}),
        children_count: sessions.length,
        had_alerts: anyAlerts,
        // Wave 9 P0-5 sub-PR C + Codex hotfix: flag the batch when a
        // staffed-station override was actually consumed. Lets
        // compliance scans answer "which batches used the override"
        // without joining against the per-child override audit.
        ratio_override_used: ratioOverrideUsed,
        ratio_blocked_count: ratioBlocked.length,
      },
      outcome: "ok",
    });

    // Wave 9 P0-4 sub-PR B: distinguish "alert delivered + acknowledged"
    // from "alert delivered, never confirmed." Only fires when the
    // batch actually had alerts AND the operator confirmed. The
    // counterpart "alert delivered, NOT confirmed" is already captured
    // by `had_alerts: true` + `alerts_acknowledged: false` on the
    // session doc + the absence of this audit row.
    if (anyAlerts && alerts_acknowledged) {
      void audit({
        church_id,
        actor: kiosk.station_id ? kioskActor(kiosk.station_id) : "kiosk:bootstrap",
        action: "kiosk.alert_acknowledged",
        target_type: "checkin_session_batch",
        target_id: household_id,
        metadata: {
          service_date,
          ...(service_id ? { service_id } : {}),
          children_count: sessions.length,
        },
        outcome: "ok",
      });
    }

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        child_id: s.child_id,
        room_name: s.room_name,
        checked_in_at: s.checked_in_at,
      })),
      // Codex Wave 7 Row 5 (retest residual): suppress the freshly-generated
      // security_code when no new sessions were created — a no-op duplicate
      // shouldn't surface a code that maps to nothing. A future "lost sticker:
      // re-show me my code" workflow would return existing session codes;
      // that's intentionally NOT this path.
      security_code: sessions.length > 0 ? securityCode : null,
      label_payloads: labelPayloads,
      // Codex Wave 7 Row 5: children skipped because they were already
      // actively checked in for this service_date (no duplicate session made).
      already_checked_in: alreadyCheckedIn,
      // Wave 9 P0-5 sub-PR C: children blocked by the ratio gate.
      // Carries the per-child evaluation so the kiosk UI can show
      // "Room over ratio — talk to staff to override." Empty when the
      // batch passed cleanly OR an X-Ratio-Override was honored.
      ratio_blocked: ratioBlocked,
      print_server_url: printerConfig?.print_server_url || null,
      // Native kiosk app uses this to route to Brother SDK / AirPrint
      ...(printerConfig
        ? {
            printer_config: {
              print_method: printerConfig.print_method || "print_server",
              printer_type: printerConfig.printer_type,
              connection_type: printerConfig.connection_type,
              bluetooth_address: printerConfig.bluetooth_address,
              ip_address: printerConfig.ip_address,
              label_size: printerConfig.label_size,
              printer_model: printerConfig.printer_model,
            },
          }
        : {}),
    });
  } catch (error) {
    console.error("[POST /api/checkin/checkin]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function formatDateForLabel(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
