/**
 * Photo upload + delete for a blocked-pickup entry.
 *
 * Wave 9 P0-2 sub-PR C. Mirrors the authorized-pickup photo route but
 * writes to the `checkin_blocked_pickups` subcollection instead. Both
 * routes go through the same `uploadCheckInPhoto()` helper.
 *
 * Reads of the photo are NEVER unsigned — UI calls
 * /api/admin/checkin/photo?path=... for a short-TTL signed URL.
 *
 * Auth: owner / admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { audit, userActor } from "@/lib/server/audit";
import { log } from "@/lib/log";
import type { BlockedPickup } from "@/lib/types";
import {
  CHECKIN_PHOTO_ALLOWED_TYPES,
  CHECKIN_PHOTO_MAX_BYTES,
  deleteCheckInPhoto,
  uploadCheckInPhoto,
} from "@/lib/server/checkin-photos";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const formData = await req.formData();
    const churchIdField = formData.get("church_id");
    if (typeof churchIdField !== "string" || !churchIdField.trim()) {
      return NextResponse.json(
        { error: "church_id form field is required" },
        { status: 400 },
      );
    }

    const shimReq = new NextRequest(
      `${req.nextUrl.origin}${req.nextUrl.pathname}?church_id=${encodeURIComponent(churchIdField.trim())}`,
      { method: "POST", headers: req.headers },
    );
    const gate = await requireModuleTier(shimReq, "checkin", { churchIdFrom: "query" });
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only owners and admins can upload pickup photos" },
        { status: 403 },
      );
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "file form field is required" },
        { status: 400 },
      );
    }
    if (file.size > CHECKIN_PHOTO_MAX_BYTES) {
      return NextResponse.json(
        {
          error: `File too large (max ${Math.round(
            CHECKIN_PHOTO_MAX_BYTES / 1024 / 1024,
          )} MB)`,
        },
        { status: 400 },
      );
    }
    if (
      !CHECKIN_PHOTO_ALLOWED_TYPES.includes(
        file.type as (typeof CHECKIN_PHOTO_ALLOWED_TYPES)[number],
      )
    ) {
      return NextResponse.json(
        {
          error: `Invalid file type. Allowed: ${CHECKIN_PHOTO_ALLOWED_TYPES.join(
            ", ",
          )}`,
        },
        { status: 400 },
      );
    }

    const docRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("checkin_blocked_pickups")
      .doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const current = docSnap.data() as BlockedPickup;
    if (current.church_id !== churchId) {
      return NextResponse.json(
        { error: "Cross-tenant access denied" },
        { status: 403 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { storage_path } = await uploadCheckInPhoto({
      churchId,
      kind: "blocked",
      id,
      buffer,
      contentType: file.type,
      uploadedBy: userId,
    });

    const previousPath = current.photo_url ?? null;
    if (previousPath && previousPath !== storage_path) {
      await deleteCheckInPhoto(previousPath);
    }

    await docRef.update({ photo_url: storage_path });

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "pickup.blocked_photo_added",
      target_type: "checkin_blocked_pickup",
      target_id: id,
      metadata: {
        content_type: file.type,
        bytes: file.size,
        scope: current.scope,
      },
      outcome: "ok",
    });

    return NextResponse.json({ photo_path: storage_path }, { status: 201 });
  } catch (error) {
    log.error("[POST /api/admin/checkin/blocked-pickups/[id]/photo]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
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
        { error: "Only owners and admins can remove pickup photos" },
        { status: 403 },
      );
    }

    const docRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("checkin_blocked_pickups")
      .doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const current = docSnap.data() as BlockedPickup;
    if (current.church_id !== churchId) {
      return NextResponse.json(
        { error: "Cross-tenant access denied" },
        { status: 403 },
      );
    }

    const previousPath = current.photo_url ?? null;
    if (previousPath) {
      await deleteCheckInPhoto(previousPath);
    }
    await docRef.update({ photo_url: null });

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "pickup.blocked_photo_removed",
      target_type: "checkin_blocked_pickup",
      target_id: id,
      metadata: { scope: current.scope },
      outcome: "ok",
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error("[DELETE /api/admin/checkin/blocked-pickups/[id]/photo]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
