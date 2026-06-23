/**
 * POST /api/teacher/page-parent
 *
 * Wave 10 W10-3. Lets a checked-in teacher page the parent(s) for a
 * specific child session from their personal dashboard. SMS fans out
 * to the primary guardian phone + each `present_recipients` entry,
 * deduped by normalized phone.
 *
 * Auth: Bearer JWT.
 *
 * Authorization gates (BOTH must pass):
 *   1. Caller's UID maps to a Person doc with `person_type=adult`
 *      in this church (the same gate `/api/teacher/dashboard` uses).
 *   2. The caller is CURRENTLY checked into the SAME room as the
 *      session — there's an active `RoomVolunteerCheckIn` row with
 *      `room_id == session.room_id`, `service_date == session.service_date`,
 *      `person_id == teacherPersonId`, and `checked_out_at` is null.
 *      This means a teacher in Room A can't page parents in Room B,
 *      and a parent who happens to be signed into the app can't page
 *      anyone unless they're a checked-in volunteer.
 *
 * Body: { church_id, session_id, note? }
 *   - `note` is an optional teacher-supplied detail (e.g. "needs a
 *     diaper change"). Capped at 200 chars; \r\n stripped to keep
 *     the SMS body single-paragraph. Stored verbatim in the audit row.
 *
 * Rate limit:
 *   - Global: 12/min via `rateLimit` (same kiosk-comms pattern).
 *   - Per-teacher-per-session: 60s cooldown enforced in-process to
 *     prevent rapid-fire paging of the same parent. Returns 429
 *     `Slow down — you paged this parent recently. Try again in Xs`.
 *
 * Audit: `teacher.parent_paged` with metadata
 *   { session_id, room_id, child_id, recipients_count, note_provided }.
 *
 * Response:
 *   { success: true, recipients_count: <n>, sent_to: [<masked phone>, ...] }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { loadChild, loadHouseholdPhone } from "@/lib/server/checkin-helpers";
import { hasClassroomOversight } from "@/lib/server/classroom-oversight";
import { sendSms } from "@/lib/services/sms";
import { audit, userActor } from "@/lib/server/audit";
import { normalizePhone } from "@/lib/utils/phone";
import { log } from "@/lib/log";
import type {
  CheckInSession,
  RoomVolunteerCheckIn,
  Room,
} from "@/lib/types";

const NOTE_MAX_CHARS = 200;
const COOLDOWN_MS = 60_000;

// Per-teacher-per-session cooldown cache. Key is
// `${churchId}:${teacherPersonId}:${sessionId}`; value is the
// wall-clock ms of the most recent successful page.
const cooldownCache = new Map<string, number>();

function checkCooldown(key: string): { ok: true } | { ok: false; secs: number } {
  const last = cooldownCache.get(key);
  if (!last) return { ok: true };
  const elapsed = Date.now() - last;
  if (elapsed >= COOLDOWN_MS) return { ok: true };
  return { ok: false, secs: Math.ceil((COOLDOWN_MS - elapsed) / 1000) };
}

function setCooldown(key: string): void {
  const now = Date.now();
  cooldownCache.set(key, now);
  if (cooldownCache.size > 2_000) {
    const cutoff = now - 2 * COOLDOWN_MS;
    for (const [k, v] of cooldownCache) {
      if (v < cutoff) cooldownCache.delete(k);
    }
  }
}

function maskPhone(p: string): string {
  const digits = p.replace(/[^0-9]/g, "");
  return digits.length >= 4 ? `***${digits.slice(-4)}` : "****";
}

async function authUid(req: NextRequest): Promise<string | NextResponse> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

interface PostBody {
  church_id?: unknown;
  session_id?: unknown;
  note?: unknown;
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 12, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const uid = await authUid(req);
    if (uid instanceof NextResponse) return uid;

    // CRITICAL: call requireModuleTier BEFORE consuming the body.
    // The helper does `req.clone().json()` internally; cloning AFTER
    // the original stream has been read yields a clone with an
    // already-consumed stream, so the tier helper returns
    // "Missing church_id" even when the body has it. Codex W10-3
    // finding 1.
    const gate = await requireModuleTier(req, "checkin", {
      churchIdFrom: "body",
      allowAnonymous: true,
    });
    if (!gate.ok) return gate.response;

    const body = (await req.json().catch(() => ({}))) as PostBody;
    const churchId =
      typeof body.church_id === "string" ? body.church_id.trim() : "";
    const sessionId =
      typeof body.session_id === "string" ? body.session_id.trim() : "";
    // Normalize the optional note: strip CR/LF (keeps body single-line in
    // SMS), trim, cap to NOTE_MAX_CHARS. Anything else passes through.
    const note =
      typeof body.note === "string"
        ? body.note.replace(/[\r\n]+/g, " ").trim().slice(0, NOTE_MAX_CHARS)
        : "";

    if (!churchId || !sessionId) {
      return NextResponse.json(
        { error: "church_id and session_id are required" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Classroom oversight (owner/admin/checkin_manager flag) may page
    // from any room without a Person doc or a room check-in.
    const oversight = await hasClassroomOversight(churchId, uid);

    // Gate 1: caller's Person doc (oversight callers may not have one).
    const personSnap = await churchRef
      .collection("people")
      .where("user_id", "==", uid)
      .where("person_type", "==", "adult")
      .limit(1)
      .get();
    if (personSnap.empty && !oversight) {
      return NextResponse.json(
        { error: "Not registered as a volunteer in this church" },
        { status: 403 },
      );
    }
    let teacherPersonId = uid;
    let teacherName = "The check-in team";
    if (!personSnap.empty) {
      teacherPersonId = personSnap.docs[0].id;
      teacherName =
        (personSnap.docs[0].data().preferred_name as string) ||
        (personSnap.docs[0].data().first_name as string) ||
        (personSnap.docs[0].data().name as string) ||
        "A teacher";
    } else {
      const userSnap = await adminDb.doc(`users/${uid}`).get();
      teacherName =
        (userSnap.data()?.display_name as string) || teacherName;
    }

    // Load session.
    const sessionSnap = await churchRef
      .collection("checkInSessions")
      .doc(sessionId)
      .get();
    if (!sessionSnap.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const session = sessionSnap.data() as CheckInSession;
    if (session.checked_out_at) {
      return NextResponse.json(
        { error: "Child has already been checked out" },
        { status: 409 },
      );
    }

    // Gate 2: caller is checked in to the session's room TODAY —
    // bypassed for classroom oversight.
    if (!oversight) {
      const myCheckinsSnap = await churchRef
        .collection("roomVolunteerCheckins")
        .where("person_id", "==", teacherPersonId)
        .where("room_id", "==", session.room_id)
        .where("service_date", "==", session.service_date)
        .get();
      const isCheckedInToRoom = myCheckinsSnap.docs.some(
        (d) => (d.data() as RoomVolunteerCheckIn).checked_out_at == null,
      );
      if (!isCheckedInToRoom) {
        return NextResponse.json(
          {
            error:
              "You can only page parents for children in rooms you're checked into",
          },
          { status: 403 },
        );
      }
    }

    // Per-teacher-per-session cooldown.
    const cooldownKey = `${churchId}:${teacherPersonId}:${sessionId}`;
    const cooldown = checkCooldown(cooldownKey);
    if (!cooldown.ok) {
      return NextResponse.json(
        {
          error: `Slow down — you paged this parent recently. Try again in ${cooldown.secs}s.`,
        },
        { status: 429 },
      );
    }

    // Build recipient list: primary guardian phone + present_recipients.
    // Dedup via shared normalizePhone (strips formatting AND leading US
    // country code "1") so +15551110001 and (555) 111-0001 collapse to
    // a single recipient. Codex W10-3 finding 2.
    const primaryPhone = await loadHouseholdPhone(churchRef, session.household_id);
    const sendTo: string[] = [];
    const seen = new Set<string>();
    if (primaryPhone) {
      const norm = normalizePhone(primaryPhone);
      if (norm) {
        seen.add(norm);
        sendTo.push(primaryPhone);
      }
    }
    for (const r of session.present_recipients ?? []) {
      if (!r.phone) continue;
      const norm = normalizePhone(r.phone);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      sendTo.push(r.phone);
    }
    if (sendTo.length === 0) {
      return NextResponse.json(
        {
          error:
            "No phone numbers on file for this household. Please find the parent in person.",
        },
        { status: 422 },
      );
    }

    // Resolve room name + child name + church name for the body.
    const [roomSnap, child, churchSnap] = await Promise.all([
      churchRef.collection("rooms").doc(session.room_id).get(),
      loadChild(churchRef, session.child_id),
      churchRef.get(),
    ]);
    const roomName = roomSnap.exists
      ? ((roomSnap.data() as Room).name ?? "their classroom")
      : "their classroom";
    const childName =
      (child?.display_name ?? "your child").trim() || "your child";
    const churchName =
      (churchSnap.exists ? (churchSnap.data()?.name as string) : "") ||
      "VolunteerCal";

    const noteClause = note ? ` Note: ${note}` : "";
    const body_ = `${teacherName} at ${churchName}: please come to ${roomName} for ${childName}.${noteClause}`;

    // Set cooldown BEFORE firing SMS so a slow Twilio response doesn't
    // race with retries. The recipients_count we return reflects what
    // we attempted, not what Twilio confirmed.
    setCooldown(cooldownKey);
    for (const to of sendTo) {
      sendSms({ to, body: body_ }).catch(() => {});
    }

    void audit({
      church_id: churchId,
      actor: userActor(uid),
      action: "teacher.parent_paged",
      target_type: "checkin_session",
      target_id: sessionId,
      metadata: {
        // Duplicated from target_id for query convenience (audit
        // queries that filter on metadata.session_id; Codex W10-3
        // finding 3).
        session_id: sessionId,
        room_id: session.room_id,
        child_id: session.child_id,
        recipients_count: sendTo.length,
        note_provided: note.length > 0,
        note: note || null,
        oversight,
      },
      outcome: "ok",
    });

    return NextResponse.json({
      success: true,
      recipients_count: sendTo.length,
      sent_to: sendTo.map(maskPhone),
    });
  } catch (error) {
    log.error("[POST /api/teacher/page-parent]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
