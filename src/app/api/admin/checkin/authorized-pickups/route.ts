/**
 * Authorized-pickup contacts — POST.
 *
 * Wave 9 P0-2 sub-PR B (re-land after path-pattern fix). Adds an
 * authorized pickup contact to a specific child Person doc's
 * `child_profile.authorized_pickups` array.
 *
 * Path pattern note: this used to live at
 * `children/[personId]/authorized-pickups/route.ts`, but Next.js 16's
 * app-router bundler chokes on `[param]/static/[param]/route.ts` —
 * even an empty file at that path corrupts ALL Firebase-backed
 * function bundles in production (verified PR #154). Flattening to
 * `authorized-pickups/[id]` with `child_id` in the body avoids the bug
 * entirely. Same data model, same audit codes, same auth gates.
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
import {
  getChildPrivateMedical,
  writeChildPrivateMedical,
} from "@/lib/server/child-medical";
import type { PersonAuthorizedPickup } from "@/lib/types";

interface PostBody {
  church_id?: unknown;
  /** scope="child" → child_id required (writes to Person.child_profile.authorized_pickups).
   *  scope="household" → household_id required (writes to Household.authorized_pickups).
   *  Defaults to "child" for backwards-compat with the per-child UI that
   *  shipped first (Wave 9 P0-2). */
  scope?: unknown;
  child_id?: unknown;
  household_id?: unknown;
  name?: unknown;
  phone?: unknown;
  relationship?: unknown;
}

export async function POST(req: NextRequest) {
  try {
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

    // Scope discriminator. Default = "child" preserves the original
    // contract; only the new household scope needs callers to pass it
    // explicitly. Same shape (child | household) BlockedPickup already
    // uses — keeps the two pickup APIs visually symmetric.
    const scope =
      body.scope === "household" || body.scope === "child"
        ? body.scope
        : "child";

    let childId = "";
    let householdId = "";
    if (scope === "child") {
      childId =
        typeof body.child_id === "string" && body.child_id.trim().length > 0
          ? body.child_id.trim()
          : "";
      if (!childId) {
        return NextResponse.json(
          { error: "child_id is required when scope=child" },
          { status: 400 },
        );
      }
    } else {
      householdId =
        typeof body.household_id === "string" && body.household_id.trim().length > 0
          ? body.household_id.trim()
          : "";
      if (!householdId) {
        return NextResponse.json(
          { error: "household_id is required when scope=household" },
          { status: 400 },
        );
      }
    }

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

    const churchRef = adminDb.collection("churches").doc(churchId);

    const newPickup: PersonAuthorizedPickup = {
      id: randomUUID(),
      name,
      phone,
      relationship,
      photo_url: null,
      added_at: new Date().toISOString(),
      added_by_user_id: userId,
    };

    if (scope === "child") {
      // Phase 3: authorized_pickups now lives in the private medical
      // subdoc (churches/{id}/people/{childId}/private/medical), not on
      // the parent people doc. Validate against the parent doc (existence,
      // tenant, person_type), then read-modify-write the private subdoc.
      const personRef = churchRef.collection("people").doc(childId);
      const snap = await personRef.get();
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
      const childProfile =
        (data.child_profile as Record<string, unknown> | undefined) ?? null;
      const medical = await getChildPrivateMedical(
        churchRef,
        childId,
        childProfile,
      );
      const existing = medical.authorized_pickups;

      // Backfill missing `id` on legacy records so subsequent edits can
      // target a stable identifier (we promise this in the type comment).
      const backfilled = existing.map((p) =>
        p.id ? p : { ...p, id: randomUUID() },
      );

      writeChildPrivateMedical(
        churchRef,
        childId,
        { ...medical, authorized_pickups: [...backfilled, newPickup] },
        new Date().toISOString(),
      );
    } else {
      // scope === "household". Writes to the household doc's
      // `authorized_pickups` array. Read at check-in time alongside
      // per-child pickups by /api/checkin/recipients so the operator
      // sees "Grandma" once for every Smith kid she's authorized for.
      const householdRef = churchRef.collection("households").doc(householdId);
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(householdRef);
        if (!snap.exists) {
          throw new Error("HOUSEHOLD_NOT_FOUND");
        }
        const data = snap.data() ?? {};
        if (data.church_id !== churchId) {
          throw new Error("CROSS_TENANT");
        }
        const existing: PersonAuthorizedPickup[] = Array.isArray(
          data.authorized_pickups,
        )
          ? data.authorized_pickups
          : [];
        const backfilled = existing.map((p) =>
          p.id ? p : { ...p, id: randomUUID() },
        );
        tx.update(householdRef, {
          authorized_pickups: [...backfilled, newPickup],
          updated_at: new Date().toISOString(),
        });
      });
    }

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "pickup.authorized_added",
      target_type: scope === "child" ? "person" : "household",
      target_id: scope === "child" ? childId : householdId,
      metadata: {
        pickup_id: newPickup.id,
        has_phone: phone !== null,
        scope,
      },
      outcome: "ok",
    });

    return NextResponse.json({ pickup: newPickup }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PERSON_NOT_FOUND") {
        return NextResponse.json({ error: "Child not found" }, { status: 404 });
      }
      if (error.message === "HOUSEHOLD_NOT_FOUND") {
        return NextResponse.json(
          { error: "Household not found" },
          { status: 404 },
        );
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
    log.error("[POST /api/admin/checkin/authorized-pickups]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
