/**
 * Blocked-pickup contacts — admin CRUD (PATCH + DELETE).
 *
 * Wave 9 P0-2 sub-PR B. Edits or removes a specific blocked-pickup
 * entry. Editing scope (`child` ↔ `household`) is forbidden — to change
 * scope, delete the old entry and create a new one. This keeps audit
 * trails honest (a "court order moved from child-specific to
 * household-wide" reads as two distinct events).
 *
 * Photo / document_url upload still NOT in scope (sub-PR C).
 *
 * Auth: same gate as POST — checkin module tier + owner/admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { audit, userActor } from "@/lib/server/audit";
import { log } from "@/lib/log";
import type { BlockedPickup } from "@/lib/types";

interface PatchBody {
  church_id?: unknown;
  name?: unknown;
  phone?: unknown;
  reason?: unknown;
  notes?: unknown;
  expires_at?: unknown;
}

const VALID_REASONS = ["court_order", "household_decision", "other"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const gate = await requireModuleTier(req, "checkin", { churchIdFrom: "body" });
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only owners and admins can manage the block list" },
        { status: 403 },
      );
    }

    const body = (await req.json()) as PatchBody;

    const docRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("checkin_blocked_pickups")
      .doc(id);

    // Forbid scope / child_id / household_id changes (use delete + recreate).
    if ("scope" in body || "child_id" in body || "household_id" in body) {
      return NextResponse.json(
        {
          error:
            "scope / child_id / household_id are immutable; delete and recreate to change",
        },
        { status: 400 },
      );
    }

    const updated = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) throw new Error("NOT_FOUND");
      const current = snap.data() as BlockedPickup;
      if (current.church_id !== churchId) throw new Error("CROSS_TENANT");

      const updates: Partial<BlockedPickup> = {};

      if (typeof body.name === "string") {
        const trimmed = body.name.trim();
        if (!trimmed) throw new Error("EMPTY_NAME");
        if (trimmed.length > 200) throw new Error("NAME_TOO_LONG");
        updates.name = trimmed;
      }
      if ("phone" in body) {
        const phone =
          typeof body.phone === "string" && body.phone.trim().length > 0
            ? body.phone.trim()
            : null;
        if (phone && phone.length > 30) throw new Error("PHONE_TOO_LONG");
        updates.phone = phone;
      }
      if (typeof body.reason === "string") {
        if (
          !VALID_REASONS.includes(
            body.reason as (typeof VALID_REASONS)[number],
          )
        ) {
          throw new Error("INVALID_REASON");
        }
        updates.reason = body.reason as BlockedPickup["reason"];
      }
      if ("notes" in body) {
        const notes =
          typeof body.notes === "string" && body.notes.trim().length > 0
            ? body.notes.trim()
            : null;
        if (notes && notes.length > 2000) throw new Error("NOTES_TOO_LONG");
        updates.notes = notes;
      }
      if ("expires_at" in body) {
        const expiresAt =
          typeof body.expires_at === "string" &&
          body.expires_at.trim().length > 0
            ? body.expires_at.trim()
            : null;
        if (expiresAt && Number.isNaN(Date.parse(expiresAt))) {
          throw new Error("INVALID_EXPIRES_AT");
        }
        updates.expires_at = expiresAt;
      }

      if (Object.keys(updates).length === 0) {
        throw new Error("NO_FIELDS");
      }

      tx.update(docRef, updates as Record<string, unknown>);
      return { ...current, ...updates };
    });

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "pickup.blocked_updated",
      target_type: "checkin_blocked_pickup",
      target_id: id,
      metadata: {
        scope: updated.scope,
        fields_changed: Object.keys(body).filter(
          (k) => k !== "church_id",
        ),
      },
      outcome: "ok",
    });

    return NextResponse.json({ blocked: updated });
  } catch (error) {
    return mapKnownError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const gate = await requireModuleTier(req, "checkin", { churchIdFrom: "query" });
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only owners and admins can manage the block list" },
        { status: 403 },
      );
    }

    const docRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("checkin_blocked_pickups")
      .doc(id);

    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const current = snap.data() as BlockedPickup;
    if (current.church_id !== churchId) {
      return NextResponse.json(
        { error: "Cross-tenant access denied" },
        { status: 403 },
      );
    }

    await docRef.delete();

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "pickup.blocked_removed",
      target_type: "checkin_blocked_pickup",
      target_id: id,
      metadata: {
        scope: current.scope,
        child_id: current.child_id,
        household_id: current.household_id,
        reason: current.reason,
      },
      outcome: "ok",
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error("[DELETE /api/admin/checkin/blocked-pickups/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function mapKnownError(error: unknown): NextResponse {
  if (error instanceof Error) {
    switch (error.message) {
      case "NOT_FOUND":
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      case "CROSS_TENANT":
        return NextResponse.json(
          { error: "Cross-tenant access denied" },
          { status: 403 },
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
      case "INVALID_REASON":
        return NextResponse.json(
          { error: `reason must be one of: ${VALID_REASONS.join(", ")}` },
          { status: 400 },
        );
      case "NOTES_TOO_LONG":
        return NextResponse.json(
          { error: "notes too long (max 2000 chars)" },
          { status: 400 },
        );
      case "INVALID_EXPIRES_AT":
        return NextResponse.json(
          { error: "expires_at must be an ISO date string" },
          { status: 400 },
        );
      case "NO_FIELDS":
        return NextResponse.json(
          { error: "No editable fields supplied" },
          { status: 400 },
        );
    }
  }
  log.error("[/api/admin/checkin/blocked-pickups/[id]]", error);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
