/**
 * Family pickup-list removal request — parent self-service.
 *
 * Wave 9 P0-2 sub-PR G. Marks an authorized-pickup entry for removal
 * with a 24-hour cooling-off window. The entry stays visible (with a
 * "Pending removal" badge) until the cooling-off elapses, at which
 * point read sites filter it out.
 *
 * Other adult guardians in the household receive an email so they
 * have the full 24-hour window to push back if the removal was
 * unilateral.
 *
 * Auth: signed-in adult guardian of the child's household. Same
 * predicate as POST /api/account/family/pickups.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import {
  FamilyPickupsAuthError,
  assertGuardianOfChild,
  coolingOffEffectiveAt,
  notifyHouseholdAdults,
} from "@/lib/server/family-pickups";
import { audit, userActor } from "@/lib/server/audit";
import { log } from "@/lib/log";
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

    const personRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("people")
      .doc(childId);

    const effectiveAt = coolingOffEffectiveAt();
    let targetName = "the contact";

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(personRef);
      if (!snap.exists) throw new Error("PERSON_VANISHED");
      const data = snap.data() ?? {};
      const childProfile = data.child_profile ?? {};
      const existing: PersonAuthorizedPickup[] = Array.isArray(
        childProfile.authorized_pickups,
      )
        ? childProfile.authorized_pickups
        : [];
      const idx = existing.findIndex((p) => p.id === pickupId);
      if (idx === -1) {
        throw new Error("PICKUP_NOT_FOUND");
      }
      targetName = existing[idx].name;
      const updated = existing.slice();
      updated[idx] = {
        ...updated[idx],
        pending_remove_at: effectiveAt,
        pending_remove_by_user_id: uid,
      };
      tx.update(personRef, {
        "child_profile.authorized_pickups": updated,
        updated_at: new Date().toISOString(),
      });
    });

    void audit({
      church_id: churchId,
      actor: userActor(uid),
      action: "pickup.authorized_parent_remove_requested",
      target_type: "person",
      target_id: childId,
      metadata: {
        pickup_id: pickupId,
        effective_at: effectiveAt,
      },
      outcome: "ok",
    });

    void notifyHouseholdAdults({
      churchId,
      householdIds: resolution.householdIds,
      initiatorUserId: uid,
      subject: `Pending removal of ${targetName} from ${resolution.displayName}'s pickup list`,
      bodyText: `Hi,\n\nA guardian on this household has requested to remove ${targetName} from ${resolution.displayName}'s authorized pickup list. The removal will take effect on ${new Date(effectiveAt).toLocaleString()}. If you'd like to keep ${targetName} on the list, you can cancel the pending removal from the family check-in page before that time, or contact your church admin.\n\nThanks,\nVolunteerCal`,
      actionContext: {
        action: "parent_remove_requested",
        child_id: childId,
        pickup_id: pickupId,
        effective_at: effectiveAt,
      },
    });

    return NextResponse.json({
      pickup_id: pickupId,
      pending_remove_at: effectiveAt,
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
      "[POST /api/account/family/pickups/[id]/request-removal]",
      error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
