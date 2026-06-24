/**
 * Authorized-pickup contacts — PATCH + DELETE.
 *
 * Wave 9 P0-2 sub-PR B (re-land after path-pattern fix). Edits or
 * removes a specific authorized pickup contact within the child's
 * `child_profile.authorized_pickups` array.
 *
 * 2026-06-03 sibling-scope extension: the same routes now also handle
 * household-scope pickups (stored on the household doc's
 * `authorized_pickups` array). Scope is read from the body (PATCH) or
 * query (DELETE); `child_id` and `household_id` are interchangeable
 * targets gated by the scope value. Defaults to `scope=child` for
 * backwards-compat with the per-child UI that shipped first.
 *
 * Path pattern note: this used to live at
 * `children/[personId]/authorized-pickups/[pickupId]/route.ts`, but
 * Next.js 16's app-router bundler chokes on `[param]/static/[param]/
 * route.ts` — even an empty file at that path corrupts ALL
 * Firebase-backed function bundles in production (verified PR #154).
 * Flattening to `authorized-pickups/[id]` with `child_id` /
 * `household_id` in the body/query avoids the bug entirely.
 *
 * Photo upload still NOT in scope (sub-PR C).
 *
 * Auth: same gate as POST — checkin module tier + owner/admin role.
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

type Scope = "child" | "household";

interface PatchBody {
  church_id?: unknown;
  scope?: unknown;
  child_id?: unknown;
  household_id?: unknown;
  name?: unknown;
  phone?: unknown;
  relationship?: unknown;
}

function readScope(raw: unknown): Scope {
  return raw === "household" ? "household" : "child";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: pickupId } = await params;

    const gate = await requireModuleTier(req, "checkin", { churchIdFrom: "body" });
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only owners and admins can manage pickup contacts" },
        { status: 403 },
      );
    }

    const body = (await req.json()) as PatchBody;
    const scope = readScope(body.scope);

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

    const hasName = typeof body.name === "string";
    const hasPhone = "phone" in body;
    const hasRelationship = "relationship" in body;

    if (!hasName && !hasPhone && !hasRelationship) {
      return NextResponse.json(
        { error: "No editable fields supplied" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Shared mutation: given the current pickups array, locate the entry
    // by id, apply the field edits + validation, and return the new array
    // plus the updated entry. Used by both scopes so the edit semantics
    // stay identical regardless of where the array is stored.
    const applyEdit = (
      existing: PersonAuthorizedPickup[],
    ): { nextArray: PersonAuthorizedPickup[]; next: PersonAuthorizedPickup } => {
      const withIds = existing.map((p) =>
        p.id ? p : { ...p, id: randomUUID() },
      );

      const idx = withIds.findIndex((p) => p.id === pickupId);
      if (idx === -1) throw new Error("PICKUP_NOT_FOUND");

      const current = withIds[idx];
      const next: PersonAuthorizedPickup = {
        ...current,
        ...(hasName
          ? { name: String((body as { name: string }).name).trim() }
          : {}),
        ...(hasPhone
          ? {
              phone:
                typeof body.phone === "string" && body.phone.trim().length > 0
                  ? body.phone.trim()
                  : null,
            }
          : {}),
        ...(hasRelationship
          ? {
              relationship:
                typeof body.relationship === "string" &&
                body.relationship.trim().length > 0
                  ? body.relationship.trim()
                  : null,
            }
          : {}),
      };

      if (!next.name) throw new Error("EMPTY_NAME");
      if (next.name.length > 200) throw new Error("NAME_TOO_LONG");
      if (next.phone && next.phone.length > 30) throw new Error("PHONE_TOO_LONG");

      const nextArray = [...withIds];
      nextArray[idx] = next;
      return { nextArray, next };
    };

    let updated: PersonAuthorizedPickup;
    if (scope === "child") {
      // Phase 3: child pickups live in the private medical subdoc, not on
      // the parent people doc. Validate via the parent doc, then
      // read-modify-write the private subdoc.
      const personRef = churchRef.collection("people").doc(childId);
      const snap = await personRef.get();
      if (!snap.exists) throw new Error("PERSON_NOT_FOUND");
      const data = snap.data() ?? {};
      if (data.church_id !== churchId) throw new Error("CROSS_TENANT");
      if (data.person_type !== "child") throw new Error("NOT_A_CHILD");

      const medical = await getChildPrivateMedical(churchRef, childId);
      const { nextArray, next } = applyEdit(medical.authorized_pickups);
      writeChildPrivateMedical(
        churchRef,
        childId,
        { ...medical, authorized_pickups: nextArray },
        new Date().toISOString(),
      );
      updated = next;
    } else {
      // scope === "household": writes to the household doc's
      // authorized_pickups array (Admin-SDK/rules-protected). Unchanged.
      const targetRef = churchRef.collection("households").doc(householdId);
      const fieldKey = "authorized_pickups";

      updated = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(targetRef);
        if (!snap.exists) {
          throw new Error("HOUSEHOLD_NOT_FOUND");
        }
        const data = snap.data() ?? {};
        if (data.church_id !== churchId) throw new Error("CROSS_TENANT");

        const existing: PersonAuthorizedPickup[] = Array.isArray(
          data.authorized_pickups,
        )
          ? data.authorized_pickups
          : [];

        const { nextArray, next } = applyEdit(existing);

        tx.update(targetRef, {
          [fieldKey]: nextArray,
          updated_at: new Date().toISOString(),
        });

        return next;
      });
    }

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "pickup.authorized_updated",
      target_type: scope === "child" ? "person" : "household",
      target_id: scope === "child" ? childId : householdId,
      metadata: { pickup_id: pickupId, scope },
      outcome: "ok",
    });

    return NextResponse.json({ pickup: updated });
  } catch (error) {
    return mapKnownError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: pickupId } = await params;

    const gate = await requireModuleTier(req, "checkin", { churchIdFrom: "query" });
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only owners and admins can manage pickup contacts" },
        { status: 403 },
      );
    }

    const scope = readScope(req.nextUrl.searchParams.get("scope"));
    const childId = req.nextUrl.searchParams.get("child_id");
    const householdId = req.nextUrl.searchParams.get("household_id");

    if (scope === "child" && !childId) {
      return NextResponse.json(
        { error: "child_id query param is required when scope=child" },
        { status: 400 },
      );
    }
    if (scope === "household" && !householdId) {
      return NextResponse.json(
        { error: "household_id query param is required when scope=household" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(churchId);

    if (scope === "child") {
      // Phase 3: child pickups live in the private medical subdoc, not on
      // the parent people doc. Validate via the parent doc, then
      // read-modify-write the private subdoc.
      const personRef = churchRef.collection("people").doc(childId!);
      const snap = await personRef.get();
      if (!snap.exists) throw new Error("PERSON_NOT_FOUND");
      const data = snap.data() ?? {};
      if (data.church_id !== churchId) throw new Error("CROSS_TENANT");
      if (data.person_type !== "child") throw new Error("NOT_A_CHILD");

      const medical = await getChildPrivateMedical(churchRef, childId!);
      const existing = medical.authorized_pickups;

      const idx = existing.findIndex((p) => p.id === pickupId);
      if (idx === -1) throw new Error("PICKUP_NOT_FOUND");

      const nextArray = existing.filter((p) => p.id !== pickupId);

      writeChildPrivateMedical(
        churchRef,
        childId!,
        { ...medical, authorized_pickups: nextArray },
        new Date().toISOString(),
      );
    } else {
      // scope === "household": writes to the household doc's
      // authorized_pickups array (Admin-SDK/rules-protected). Unchanged.
      const targetRef = churchRef.collection("households").doc(householdId!);
      const fieldKey = "authorized_pickups";

      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(targetRef);
        if (!snap.exists) {
          throw new Error("HOUSEHOLD_NOT_FOUND");
        }
        const data = snap.data() ?? {};
        if (data.church_id !== churchId) throw new Error("CROSS_TENANT");

        const existing: PersonAuthorizedPickup[] = Array.isArray(
          data.authorized_pickups,
        )
          ? data.authorized_pickups
          : [];

        const idx = existing.findIndex((p) => p.id === pickupId);
        if (idx === -1) throw new Error("PICKUP_NOT_FOUND");

        const nextArray = existing.filter((p) => p.id !== pickupId);

        tx.update(targetRef, {
          [fieldKey]: nextArray,
          updated_at: new Date().toISOString(),
        });
      });
    }

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "pickup.authorized_removed",
      target_type: scope === "child" ? "person" : "household",
      target_id: scope === "child" ? childId! : householdId!,
      metadata: { pickup_id: pickupId, scope },
      outcome: "ok",
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return mapKnownError(error);
  }
}

function mapKnownError(error: unknown): NextResponse {
  if (error instanceof Error) {
    switch (error.message) {
      case "PERSON_NOT_FOUND":
        return NextResponse.json({ error: "Child not found" }, { status: 404 });
      case "HOUSEHOLD_NOT_FOUND":
        return NextResponse.json(
          { error: "Household not found" },
          { status: 404 },
        );
      case "PICKUP_NOT_FOUND":
        return NextResponse.json(
          { error: "Authorized-pickup entry not found" },
          { status: 404 },
        );
      case "CROSS_TENANT":
        return NextResponse.json(
          { error: "Cross-tenant access denied" },
          { status: 403 },
        );
      case "NOT_A_CHILD":
        return NextResponse.json(
          { error: "Target person is not a child" },
          { status: 400 },
        );
      case "EMPTY_NAME":
        return NextResponse.json(
          { error: "name cannot be blank" },
          { status: 400 },
        );
      case "NAME_TOO_LONG":
        return NextResponse.json(
          { error: "name too long (max 200 chars)" },
          { status: 400 },
        );
      case "PHONE_TOO_LONG":
        return NextResponse.json(
          { error: "phone too long (max 30 chars)" },
          { status: 400 },
        );
    }
  }
  log.error("[/api/admin/checkin/authorized-pickups/[id]]", error);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
