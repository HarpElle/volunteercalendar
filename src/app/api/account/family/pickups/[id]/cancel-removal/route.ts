/**
 * Family pickup-list removal cancellation — parent self-service.
 *
 * Wave 9 P0-2 sub-PR G. Clears a pending_remove_at marker on an
 * authorized-pickup entry, so the entry stays on the list. Any
 * adult guardian of the child's household can cancel a pending
 * removal (not just the one who requested it).
 *
 * Auth: signed-in adult guardian of the child's household.
 */

import { NextRequest, NextResponse } from "next/server";
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
  writeChildPrivateMedical,
} from "@/lib/server/child-medical";
import type { PersonAuthorizedPickup } from "@/lib/types";

interface PostBody {
  church_id?: unknown;
  child_id?: unknown;
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: pickupId } = await params;

    const uid = await authUid(req);
    if (uid instanceof NextResponse) return uid;

    const body = (await req.json()) as PostBody;
    const churchId =
      typeof body.church_id === "string" ? body.church_id.trim() : "";
    const childId =
      typeof body.child_id === "string" ? body.child_id.trim() : "";
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

    let targetName = "the contact";

    // Phase 3: authorized_pickups lives in the private medical subdoc, not
    // the parent people doc. Validate the parent doc still exists, then
    // read-modify-write the cleared pending markers on the private subdoc.
    const snap = await personRef.get();
    if (!snap.exists) throw new Error("PERSON_VANISHED");
    const medical = await getChildPrivateMedical(churchRef, childId);
    const existing: PersonAuthorizedPickup[] = medical.authorized_pickups;
    const idx = existing.findIndex((p) => p.id === pickupId);
    if (idx === -1) throw new Error("PICKUP_NOT_FOUND");
    if (existing[idx].pending_remove_at) {
      // Skip the write when already not pending — idempotent no-op
      // (preserves the prior in-transaction early return).
      targetName = existing[idx].name;
      const updated = existing.slice();
      // NOTE: Firestore rejects `undefined` in nested array values
      // (the document write is wrapped as `{authorized_pickups: [...]}`
      // and the SDK serializer throws on undefined). We MUST write
      // `null` to clear the pending markers, not omit the key.
      updated[idx] = {
        ...updated[idx],
        pending_remove_at: null,
        pending_remove_by_user_id: null,
      };
      writeChildPrivateMedical(
        churchRef,
        childId,
        { ...medical, authorized_pickups: updated },
        new Date().toISOString(),
      );
    }

    void audit({
      church_id: churchId,
      actor: userActor(uid),
      action: "pickup.authorized_parent_remove_canceled",
      target_type: "person",
      target_id: childId,
      metadata: { pickup_id: pickupId },
      outcome: "ok",
    });

    void notifyHouseholdAdults({
      churchId,
      householdIds: resolution.householdIds,
      initiatorUserId: uid,
      subject: `Removal of ${targetName} canceled — ${resolution.displayName}'s pickup list`,
      bodyText: `Hi,\n\nThe pending removal of ${targetName} from ${resolution.displayName}'s authorized pickup list has been canceled. ${targetName} remains on the list.\n\nThanks,\nVolunteerCal`,
      actionContext: {
        action: "parent_remove_canceled",
        child_id: childId,
        pickup_id: pickupId,
      },
    });

    return NextResponse.json({
      pickup_id: pickupId,
      canceled: true,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PICKUP_NOT_FOUND") {
        return NextResponse.json(
          { error: "Pickup contact not found" },
          { status: 404 },
        );
      }
      if (error.message === "PERSON_VANISHED") {
        return NextResponse.json(
          { error: "Child record not found" },
          { status: 404 },
        );
      }
    }
    log.error(
      "[POST /api/account/family/pickups/[id]/cancel-removal]",
      error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
