/**
 * Authorized-pickup contacts — child-scoped CRUD (PATCH + DELETE).
 *
 * Wave 9 P0-2 sub-PR B. Edits or removes a specific authorized pickup
 * contact within `child_profile.authorized_pickups`.
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
import type { PersonAuthorizedPickup } from "@/lib/types";

interface PatchBody {
  church_id?: unknown;
  name?: unknown;
  phone?: unknown;
  relationship?: unknown;
}

async function loadParams(
  params: Promise<{ personId: string; pickupId: string }>,
): Promise<{ personId: string; pickupId: string }> {
  return await params;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ personId: string; pickupId: string }> },
) {
  try {
    const { personId, pickupId } = await loadParams(params);

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

    // Each field is optional on PATCH — only present fields apply.
    const hasName = typeof body.name === "string";
    const hasPhone = "phone" in body;
    const hasRelationship = "relationship" in body;

    if (!hasName && !hasPhone && !hasRelationship) {
      return NextResponse.json(
        { error: "No editable fields supplied" },
        { status: 400 },
      );
    }

    const personRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("people")
      .doc(personId);

    const updated = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(personRef);
      if (!snap.exists) throw new Error("PERSON_NOT_FOUND");
      const data = snap.data() ?? {};
      if (data.church_id !== churchId) throw new Error("CROSS_TENANT");
      if (data.person_type !== "child") throw new Error("NOT_A_CHILD");

      const childProfile = data.child_profile ?? {};
      const existing: PersonAuthorizedPickup[] = Array.isArray(
        childProfile.authorized_pickups,
      )
        ? childProfile.authorized_pickups
        : [];

      // Backfill missing IDs before we try to match.
      const withIds = existing.map((p) =>
        p.id ? p : { ...p, id: randomUUID() },
      );

      const idx = withIds.findIndex((p) => p.id === pickupId);
      if (idx === -1) throw new Error("PICKUP_NOT_FOUND");

      const current = withIds[idx];
      const next: PersonAuthorizedPickup = {
        ...current,
        ...(hasName
          ? {
              name: String((body as { name: string }).name).trim(),
            }
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

      tx.update(personRef, {
        "child_profile.authorized_pickups": nextArray,
        updated_at: new Date().toISOString(),
      });

      return next;
    });

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "pickup.authorized_updated",
      target_type: "person",
      target_id: personId,
      metadata: { pickup_id: pickupId },
      outcome: "ok",
    });

    return NextResponse.json({ pickup: updated });
  } catch (error) {
    return mapKnownError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ personId: string; pickupId: string }> },
) {
  try {
    const { personId, pickupId } = await loadParams(params);

    const gate = await requireModuleTier(req, "checkin", { churchIdFrom: "query" });
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only owners and admins can manage pickup contacts" },
        { status: 403 },
      );
    }

    const personRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("people")
      .doc(personId);

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(personRef);
      if (!snap.exists) throw new Error("PERSON_NOT_FOUND");
      const data = snap.data() ?? {};
      if (data.church_id !== churchId) throw new Error("CROSS_TENANT");
      if (data.person_type !== "child") throw new Error("NOT_A_CHILD");

      const childProfile = data.child_profile ?? {};
      const existing: PersonAuthorizedPickup[] = Array.isArray(
        childProfile.authorized_pickups,
      )
        ? childProfile.authorized_pickups
        : [];

      const idx = existing.findIndex((p) => p.id === pickupId);
      if (idx === -1) throw new Error("PICKUP_NOT_FOUND");

      const nextArray = existing.filter((p) => p.id !== pickupId);

      tx.update(personRef, {
        "child_profile.authorized_pickups": nextArray,
        updated_at: new Date().toISOString(),
      });
    });

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "pickup.authorized_removed",
      target_type: "person",
      target_id: personId,
      metadata: { pickup_id: pickupId },
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
  log.error(
    "[/api/admin/checkin/children/[personId]/authorized-pickups/[pickupId]]",
    error,
  );
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
