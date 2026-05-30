/**
 * Authorized-pickup contacts — child-scoped CRUD (POST).
 *
 * Wave 9 P0-2 sub-PR B. Adds an authorized pickup contact to a specific
 * child Person doc's `child_profile.authorized_pickups` array.
 *
 * Photo upload is NOT in scope for this sub-PR — it lands with the
 * Storage signed-URL helpers in sub-PR C. The `photo_url` field is left
 * unset here; existing legacy records without an `id` get one
 * backfilled on next write.
 *
 * Auth:
 *   - Module tier: checkin
 *   - Role: owner / admin only (basic family management; consistent
 *     with the rest of admin/checkin/* routes that gate on this pair)
 *
 * See `BlockedPickup` (separate subcollection) for the
 * "not authorized" side — different privacy boundary.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { audit, userActor } from "@/lib/server/audit";
import { log } from "@/lib/log";
import type { PersonAuthorizedPickup } from "@/lib/types";

interface PostBody {
  church_id?: unknown;
  name?: unknown;
  phone?: unknown;
  relationship?: unknown;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ personId: string }> },
) {
  try {
    const { personId } = await params;

    const gate = await requireModuleTier(req, "checkin", { churchIdFrom: "body" });
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only owners and admins can manage pickup contacts" },
        { status: 403 },
      );
    }

    const body = (await req.json()) as PostBody;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone =
      typeof body.phone === "string" && body.phone.trim().length > 0
        ? body.phone.trim()
        : null;
    const relationship =
      typeof body.relationship === "string" && body.relationship.trim().length > 0
        ? body.relationship.trim()
        : null;

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

    const personRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("people")
      .doc(personId);

    const newPickup: PersonAuthorizedPickup = {
      id: randomUUID(),
      name,
      phone,
      relationship,
      photo_url: null,
      added_at: new Date().toISOString(),
      added_by_user_id: userId,
    };

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(personRef);
      if (!snap.exists) {
        throw new Error("PERSON_NOT_FOUND");
      }
      const data = snap.data() ?? {};
      if (data.church_id !== churchId) {
        throw new Error("CROSS_TENANT");
      }
      if (data.person_type !== "child") {
        throw new Error("NOT_A_CHILD");
      }
      const childProfile = data.child_profile ?? {};
      const existing: PersonAuthorizedPickup[] = Array.isArray(
        childProfile.authorized_pickups,
      )
        ? childProfile.authorized_pickups
        : [];

      // Backfill missing `id` on legacy records so subsequent edits can
      // target a stable identifier (we promise this in the type comment).
      const backfilled = existing.map((p) =>
        p.id ? p : { ...p, id: randomUUID() },
      );

      tx.update(personRef, {
        "child_profile.authorized_pickups": [...backfilled, newPickup],
        updated_at: new Date().toISOString(),
      });
    });

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "pickup.authorized_added",
      target_type: "person",
      target_id: personId,
      metadata: { pickup_id: newPickup.id, has_phone: phone !== null },
      outcome: "ok",
    });

    return NextResponse.json({ pickup: newPickup }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PERSON_NOT_FOUND") {
        return NextResponse.json({ error: "Child not found" }, { status: 404 });
      }
      if (error.message === "CROSS_TENANT") {
        return NextResponse.json(
          { error: "Cross-tenant access denied" },
          { status: 403 },
        );
      }
      if (error.message === "NOT_A_CHILD") {
        return NextResponse.json(
          { error: "Target person is not a child" },
          { status: 400 },
        );
      }
    }
    log.error("[POST /api/admin/checkin/children/[personId]/authorized-pickups]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
