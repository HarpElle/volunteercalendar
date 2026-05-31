/**
 * Block-list preview for the kiosk's staffed-checkout flow.
 *
 * Wave 9 P0-2 sub-PR F. Given a security code, returns the union of
 * blocked-pickup entries that apply to the children behind that code:
 *   - child-scope blocks for each child in the matching session(s)
 *   - household-scope blocks for each household the children belong to
 *
 * The kiosk calls this BEFORE the actual /api/checkin/checkout to give
 * the operator a chance to visually compare the on-site pickup person
 * against the photos. If the response contains any blocks, the kiosk
 * UI shows a full-screen review modal. The operator then either
 *   - confirms the on-site person is NOT on the list → proceeds with
 *     normal checkout via /api/checkin/checkout, OR
 *   - taps "person IS on this list" → fires
 *     /api/checkin/blocked-pickup-attempt → blocks release + alerts
 *     owner + ERT.
 *
 * Auth: requires a staffed-station X-Kiosk-Token (same scope as
 * /api/checkin/checkout). Self-service stations don't reach this
 * endpoint because the Check Out button is hidden on them (P0-1).
 *
 * Path note: this lives at /api/checkin/blocked-pickups, NOT under
 * /api/admin/checkin/* — different auth surface (kiosk token, not
 * Bearer) and different downstream caller (the kiosk UI, not the
 * admin UI).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import {
  assertKioskChurchMatch,
  requireKioskToken,
} from "@/lib/server/authz";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { log } from "@/lib/log";
import type { BlockedPickup, CheckInSession } from "@/lib/types";

interface PostBody {
  church_id?: unknown;
  security_code?: unknown;
}

interface ChildPreview {
  child_id: string;
  child_name: string;
  household_id: string | null;
  room_name?: string | null;
}

export async function POST(req: NextRequest) {
  const kiosk = await requireKioskToken(req, "checkout");
  if (kiosk instanceof NextResponse) return kiosk;

  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
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

    if (!churchId) {
      return NextResponse.json(
        { error: "church_id is required" },
        { status: 400 },
      );
    }
    if (!securityCode || securityCode.length < 4) {
      return NextResponse.json(
        { error: "security_code is required (4 characters)" },
        { status: 400 },
      );
    }

    const mismatch = assertKioskChurchMatch(kiosk, churchId);
    if (mismatch) return mismatch;

    // Find active sessions for this code in this church TODAY.
    //
    // IMPORTANT (Sev 1 fix on Codex P0-2F retest): the previous query
    // filtered on `status == "checked_in"`, but the `checkInSessions`
    // doc schema does NOT have a `status` field — active vs.
    // checked-out is determined by whether `checked_out_at` is null.
    // The wrong predicate matched zero docs, which made the preview
    // return `blocks: []` even when the household had active blocks,
    // which meant the kiosk skipped the review modal and released
    // children with active blocks. Now we match the same predicate
    // shape used by /api/checkin/checkout: two equality filters,
    // active-session filter in code.
    const today = new Date().toISOString().split("T")[0];
    const sessionsSnap = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("checkInSessions")
      .where("service_date", "==", today)
      .where("security_code", "==", securityCode)
      .get();

    const activeSessionDocs = sessionsSnap.docs.filter(
      (d) => !d.data().checked_out_at,
    );

    if (activeSessionDocs.length === 0) {
      // No active sessions for this code today — the kiosk client
      // distinguishes 200-with-empty-blocks from a true checkout
      // attempt's error. /api/checkin/checkout returns its own
      // "no_active_sessions" 404 when the operator actually tries to
      // check out.
      return NextResponse.json({ blocks: [], children: [] });
    }

    // Gather the children + their household IDs.
    const sessions: CheckInSession[] = activeSessionDocs.map(
      (d) => d.data() as CheckInSession,
    );
    const childIds = Array.from(new Set(sessions.map((s) => s.child_id)));
    const children: ChildPreview[] = [];
    const householdIds = new Set<string>();

    for (const session of sessions) {
      const personSnap = await adminDb
        .collection("churches")
        .doc(churchId)
        .collection("people")
        .doc(session.child_id)
        .get();
      if (!personSnap.exists) continue;
      const p = personSnap.data() ?? {};
      const hhs: string[] = Array.isArray(p.household_ids)
        ? p.household_ids
        : [];
      hhs.forEach((h) => householdIds.add(h));
      children.push({
        child_id: session.child_id,
        child_name:
          (p.preferred_name as string) ||
          (p.first_name as string) ||
          (p.name as string) ||
          "Unknown",
        household_id: hhs[0] ?? null,
        room_name: session.room_name ?? null,
      });
    }

    // Pull child-scope blocks (one query per child — small N, ≤4 typically).
    const colRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("checkin_blocked_pickups");

    const childScopedSnaps = await Promise.all(
      childIds.map((cid) =>
        colRef
          .where("scope", "==", "child")
          .where("child_id", "==", cid)
          .get(),
      ),
    );

    // Pull household-scope blocks (Firestore `in` clause capped at 30).
    const householdList = Array.from(householdIds);
    const householdScopedSnap = householdList.length
      ? await colRef
          .where("scope", "==", "household")
          .where("household_id", "in", householdList.slice(0, 30))
          .get()
      : null;

    const blocks: BlockedPickup[] = [
      ...childScopedSnaps.flatMap((snap) =>
        snap.docs.map((d) => d.data() as BlockedPickup),
      ),
      ...(householdScopedSnap
        ? householdScopedSnap.docs.map((d) => d.data() as BlockedPickup)
        : []),
    ];

    // Deduplicate (in case multiple children share a household, we might
    // fetch the same household-scope block twice via different children).
    const seen = new Set<string>();
    const dedup = blocks.filter((b) => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });

    // Filter out expired blocks server-side so the kiosk doesn't have to.
    const now = Date.now();
    const active = dedup.filter((b) => {
      if (!b.expires_at) return true;
      return Date.parse(b.expires_at) > now;
    });

    return NextResponse.json({
      blocks: active,
      children,
      session_ids: sessions.map((s) => s.id),
      _note:
        children.length === 0
          ? "No matching sessions today"
          : `${children.length} child(ren) found, ${active.length} active block(s).`,
    });
  } catch (error) {
    log.error("[POST /api/checkin/blocked-pickups]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
