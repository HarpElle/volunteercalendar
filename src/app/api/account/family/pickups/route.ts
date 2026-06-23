/**
 * Family pickup-list management — parent self-service GET + POST.
 *
 * Wave 9 P0-2 sub-PR G. Lets guardians manage their own authorized-
 * pickup list at /dashboard/account/family/pickups, distinct from the
 * admin-managed flow (/dashboard/checkin/households/[id]).
 *
 * Auth model:
 *   - Bearer JWT for the signed-in user (NOT a Bearer for the church
 *     owner / admin — this is a guardian self-service endpoint).
 *   - Per-child gate via assertGuardianOfChild: caller must be an
 *     adult member of one of the child's households (Person doc with
 *     person_type === "adult" linked by user_id, household_ids
 *     overlapping the child's).
 *   - Tier gate: requireModuleTier with allowAnonymous=true (parent
 *     usage shouldn't be gated on the church's tier — kiosk check-in
 *     gating is independent).
 *
 * Routes:
 *   GET  /api/account/family/pickups?church_id=...
 *     Returns the user's children + their authorized-pickup lists.
 *     Used by the parent self-service page to render.
 *   POST /api/account/family/pickups
 *     Body: { church_id, child_id, name, phone?, relationship? }
 *     Adds an authorized contact IMMEDIATELY (no cooling-off on
 *     adds — only removes need the 24h window per the safety design).
 *     Notifies all OTHER adult guardians via email.
 *     Audit: pickup.authorized_parent_added.
 *
 * Cooling-off applies only to REMOVALS:
 *   See /api/account/family/pickups/[id]/request-removal +
 *   /cancel-removal for those flows.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import {
  FamilyPickupsAuthError,
  assertGuardianOfChild,
  notifyHouseholdAdults,
} from "@/lib/server/family-pickups";
import { audit, userActor } from "@/lib/server/audit";
import { log } from "@/lib/log";
import {
  getChildPrivateMedical,
  getChildPrivateMedicalBatch,
  writeChildPrivateMedical,
  type ChildPrivateMedical,
} from "@/lib/server/child-medical";
import type { PersonAuthorizedPickup } from "@/lib/types";

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

export async function GET(req: NextRequest) {
  try {
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json(
        { error: "church_id is required" },
        { status: 400 },
      );
    }

    const uid = await authUid(req);
    if (uid instanceof NextResponse) return uid;

    // Tier gate (allowAnonymous because guardians don't carry org-role
    // membership; the helper still checks the church's tier).
    const gate = await requireModuleTier(req, "checkin", {
      churchIdFrom: "query",
      allowAnonymous: true,
    });
    if (!gate.ok) return gate.response;

    // Look up the caller's adult Person record in this church.
    const callerSnap = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("people")
      .where("user_id", "==", uid)
      .where("person_type", "==", "adult")
      .limit(1)
      .get();
    if (callerSnap.empty) {
      return NextResponse.json(
        {
          error:
            "Not registered as an adult in this church. Contact your church admin.",
        },
        { status: 403 },
      );
    }
    const caller = callerSnap.docs[0].data();
    const householdIds: string[] = Array.isArray(caller.household_ids)
      ? caller.household_ids
      : [];

    if (householdIds.length === 0) {
      return NextResponse.json({ households: [] });
    }

    // Find all children in those households.
    const childrenSnap = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("people")
      .where("person_type", "==", "child")
      .where("household_ids", "array-contains-any", householdIds.slice(0, 30))
      .get();

    // Also fetch the household docs for name display.
    const householdSnaps = await Promise.all(
      householdIds.map((h) =>
        adminDb
          .collection("churches")
          .doc(churchId)
          .collection("households")
          .doc(h)
          .get(),
      ),
    );
    const householdsById = new Map<string, { id: string; name: string }>();
    for (const s of householdSnaps) {
      if (s.exists) {
        const d = s.data() ?? {};
        householdsById.set(s.id, {
          id: s.id,
          name: (d.name as string) || "Household",
        });
      }
    }

    // Read-time filter for elapsed cooling-off entries: any pickup
    // whose `pending_remove_at` is in the past is considered "removed"
    // from the parent surface even though the doc still has the row
    // (G v2 will add a cron to physically prune). This is the
    // canonical filter for parent reads; the admin endpoint
    // intentionally returns elapsed entries so admins can see history.
    const now = Date.now();
    const filterElapsed = (
      list: PersonAuthorizedPickup[],
    ): PersonAuthorizedPickup[] =>
      list.filter((p) => {
        if (!p.pending_remove_at) return true;
        const t = Date.parse(p.pending_remove_at);
        return Number.isNaN(t) || t > now;
      });

    // Phase 3: authorized_pickups now lives in the private medical
    // subdoc. Batch-read all children's private docs (one getAll),
    // falling back per-child to the legacy parent child_profile during
    // the migration window.
    const churchRef = adminDb.collection("churches").doc(churchId);
    const childMedicalFallback = new Map<
      string,
      Record<string, unknown> | null | undefined
    >();
    for (const cd of childrenSnap.docs) {
      childMedicalFallback.set(
        cd.id,
        cd.data().child_profile as Record<string, unknown> | undefined,
      );
    }
    const childMedicalById = await getChildPrivateMedicalBatch(
      churchRef,
      childrenSnap.docs.map((cd) => cd.id),
      childMedicalFallback,
    );

    // Group children by household.
    const households = Array.from(householdsById.values()).map((h) => ({
      ...h,
      children: childrenSnap.docs
        .filter((cd) => {
          const hh = cd.data().household_ids;
          return Array.isArray(hh) && hh.includes(h.id);
        })
        .map((cd) => {
          const d = cd.data();
          const raw = childMedicalById.get(cd.id)?.authorized_pickups ?? [];
          return {
            id: cd.id,
            first_name: d.first_name,
            preferred_name: d.preferred_name || null,
            last_name: d.last_name,
            authorized_pickups: filterElapsed(raw),
          };
        }),
    }));

    return NextResponse.json({ households });
  } catch (error) {
    log.error("[GET /api/account/family/pickups]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

interface PostBody {
  church_id?: unknown;
  child_id?: unknown;
  name?: unknown;
  phone?: unknown;
  relationship?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const uid = await authUid(req);
    if (uid instanceof NextResponse) return uid;

    const body = (await req.json()) as PostBody;
    const churchId =
      typeof body.church_id === "string" ? body.church_id.trim() : "";
    const childId =
      typeof body.child_id === "string" ? body.child_id.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone =
      typeof body.phone === "string" && body.phone.trim().length > 0
        ? body.phone.trim()
        : null;
    const relationship =
      typeof body.relationship === "string" &&
      body.relationship.trim().length > 0
        ? body.relationship.trim()
        : null;

    if (!churchId) {
      return NextResponse.json(
        { error: "church_id is required" },
        { status: 400 },
      );
    }
    if (!childId) {
      return NextResponse.json(
        { error: "child_id is required" },
        { status: 400 },
      );
    }
    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 },
      );
    }
    if (name.length > 200) {
      return NextResponse.json(
        { error: "name too long (max 200 chars)" },
        { status: 400 },
      );
    }
    if (phone && phone.length > 30) {
      return NextResponse.json(
        { error: "phone too long (max 30 chars)" },
        { status: 400 },
      );
    }

    const shimReq = new NextRequest(
      `${req.nextUrl.origin}${req.nextUrl.pathname}?church_id=${encodeURIComponent(churchId)}`,
      { method: "POST", headers: req.headers },
    );
    const gate = await requireModuleTier(shimReq, "checkin", {
      churchIdFrom: "query",
      allowAnonymous: true,
    });
    if (!gate.ok) return gate.response;

    let resolution;
    try {
      resolution = await assertGuardianOfChild({
        userId: uid,
        churchId,
        childId,
      });
    } catch (err) {
      if (err instanceof FamilyPickupsAuthError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    const churchRef = adminDb.collection("churches").doc(churchId);
    const personRef = churchRef.collection("people").doc(childId);

    const newPickup: PersonAuthorizedPickup = {
      id: randomUUID(),
      name,
      phone,
      relationship,
      photo_url: null,
      added_at: new Date().toISOString(),
      added_by_user_id: uid,
    };

    // Phase 3: authorized_pickups is a private medical field — it lives
    // in the private subdoc, not on the parent child_profile. Read
    // current medical (fallback to legacy parent child_profile during
    // the migration window), append the new pickup, then write the full
    // medical object back (the helper merges, preserving the other four
    // private fields). assertGuardianOfChild above already proved the
    // child exists + belongs to the caller; re-check existence here to
    // preserve the prior PERSON_VANISHED guard.
    const snap = await personRef.get();
    if (!snap.exists) throw new Error("PERSON_VANISHED");
    const now = new Date().toISOString();
    const currentMedical = await getChildPrivateMedical(
      churchRef,
      childId,
      snap.data()?.child_profile as Record<string, unknown> | undefined,
    );
    const backfilled = currentMedical.authorized_pickups.map((p) =>
      p.id ? p : { ...p, id: randomUUID() },
    );
    const medical: ChildPrivateMedical = {
      ...currentMedical,
      authorized_pickups: [...backfilled, newPickup],
    };
    writeChildPrivateMedical(churchRef, childId, medical, now);
    // Keep the parent doc's updated_at fresh (non-medical bookkeeping).
    await personRef.update({ updated_at: now });

    void audit({
      church_id: churchId,
      actor: userActor(uid),
      action: "pickup.authorized_parent_added",
      target_type: "person",
      target_id: childId,
      metadata: {
        pickup_id: newPickup.id,
        has_phone: phone !== null,
      },
      outcome: "ok",
    });

    // Fire-and-forget notification to the other adults in the
    // household(s). Failure to send doesn't fail the add.
    void notifyHouseholdAdults({
      churchId,
      householdIds: resolution.householdIds,
      initiatorUserId: uid,
      subject: `Authorized pickup contact added for ${resolution.displayName}`,
      bodyText: `Hi,\n\n${name} was added as an authorized pickup contact for ${resolution.displayName} on the family check-in list. If you didn't expect this change, please review the family pickup list or contact your church admin.\n\nThanks,\nVolunteerCal`,
      actionContext: {
        action: "parent_added",
        child_id: childId,
        pickup_id: newPickup.id,
        added_name: name,
      },
    });

    return NextResponse.json({ pickup: newPickup }, { status: 201 });
  } catch (error) {
    log.error("[POST /api/account/family/pickups]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
