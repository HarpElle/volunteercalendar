/**
 * Photo upload + delete for an authorized-pickup contact.
 *
 * Wave 9 P0-2 sub-PR C (re-land after path-pattern fix). Multipart
 * upload writes to Storage via `uploadCheckInPhoto()`; the resulting
 * storage path is persisted as `photo_url` on the contact. Reads of
 * the photo are NEVER unsigned — the UI calls /api/admin/checkin/photo
 * for a short-TTL signed URL on demand.
 *
 * Path pattern note: this used to live at
 * `children/[personId]/authorized-pickups/[pickupId]/photo/route.ts`,
 * but Next.js 16's app-router bundler chokes on
 * `[param]/static/[param]/route.ts` (verified PR #154). Flattening to
 * `authorized-pickups/[id]/photo` with `child_id` as a form field /
 * query param avoids the bug entirely.
 *
 * Auth: same gate as the parent POST/PATCH/DELETE — owner / admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { audit, userActor } from "@/lib/server/audit";
import { log } from "@/lib/log";
import type { PersonAuthorizedPickup } from "@/lib/types";
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
    const { id: pickupId } = await params;

    // requireModuleTier reads church_id from the body OR query. Multipart
    // forms can't be re-parsed, so accept church_id from a form field too.
    const formData = await req.formData();
    const churchIdField = formData.get("church_id");
    if (typeof churchIdField !== "string" || !churchIdField.trim()) {
      return NextResponse.json(
        { error: "church_id form field is required" },
        { status: 400 },
      );
    }
    const childIdField = formData.get("child_id");
    if (typeof childIdField !== "string" || !childIdField.trim()) {
      return NextResponse.json(
        { error: "child_id form field is required" },
        { status: 400 },
      );
    }
    const childId = childIdField.trim();

    // We've already drained the body — supply church_id via a shim URL
    // so requireModuleTier resolves to the right church without trying
    // to re-read body.
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

    // Verify the target pickup exists on the target child in the right church.
    const personRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("people")
      .doc(childId);
    const personSnap = await personRef.get();
    if (!personSnap.exists) {
      return NextResponse.json({ error: "Child not found" }, { status: 404 });
    }
    const personData = personSnap.data() ?? {};
    if (personData.church_id !== churchId) {
      return NextResponse.json(
        { error: "Cross-tenant access denied" },
        { status: 403 },
      );
    }
    if (personData.person_type !== "child") {
      return NextResponse.json(
        { error: "Target person is not a child" },
        { status: 400 },
      );
    }
    const existingPickups: PersonAuthorizedPickup[] = Array.isArray(
      personData.child_profile?.authorized_pickups,
    )
      ? personData.child_profile.authorized_pickups
      : [];
    const pickupIdx = existingPickups.findIndex((p) => p.id === pickupId);
    if (pickupIdx === -1) {
      return NextResponse.json(
        { error: "Authorized-pickup entry not found" },
        { status: 404 },
      );
    }

    // Upload to Storage.
    const buffer = Buffer.from(await file.arrayBuffer());
    const { storage_path } = await uploadCheckInPhoto({
      churchId,
      kind: "authorized",
      id: pickupId,
      buffer,
      contentType: file.type,
      uploadedBy: userId,
    });

    // Best-effort delete of any prior photo at a *different* path (e.g.
    // jpg → png swap). Same-path overwrites already replaced the bytes.
    const previousPath = existingPickups[pickupIdx].photo_url ?? null;
    if (previousPath && previousPath !== storage_path) {
      await deleteCheckInPhoto(previousPath);
    }

    // Persist the storage path on the contact.
    const nextPickups = [...existingPickups];
    nextPickups[pickupIdx] = {
      ...nextPickups[pickupIdx],
      photo_url: storage_path,
    };
    await personRef.update({
      "child_profile.authorized_pickups": nextPickups,
      updated_at: new Date().toISOString(),
    });

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "pickup.authorized_photo_added",
      target_type: "person",
      target_id: childId,
      metadata: {
        pickup_id: pickupId,
        content_type: file.type,
        bytes: file.size,
      },
      outcome: "ok",
    });

    return NextResponse.json({ photo_path: storage_path }, { status: 201 });
  } catch (error) {
    log.error(
      "[POST /api/admin/checkin/authorized-pickups/[id]/photo]",
      error,
    );
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
    const { id: pickupId } = await params;

    const gate = await requireModuleTier(req, "checkin", { churchIdFrom: "query" });
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only owners and admins can remove pickup photos" },
        { status: 403 },
      );
    }

    const childId = req.nextUrl.searchParams.get("child_id");
    if (!childId) {
      return NextResponse.json(
        { error: "child_id query param is required" },
        { status: 400 },
      );
    }

    const personRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("people")
      .doc(childId);
    const personSnap = await personRef.get();
    if (!personSnap.exists) {
      return NextResponse.json({ error: "Child not found" }, { status: 404 });
    }
    const data = personSnap.data() ?? {};
    if (data.church_id !== churchId) {
      return NextResponse.json(
        { error: "Cross-tenant access denied" },
        { status: 403 },
      );
    }
    const existing: PersonAuthorizedPickup[] = Array.isArray(
      data.child_profile?.authorized_pickups,
    )
      ? data.child_profile.authorized_pickups
      : [];
    const idx = existing.findIndex((p) => p.id === pickupId);
    if (idx === -1) {
      return NextResponse.json(
        { error: "Authorized-pickup entry not found" },
        { status: 404 },
      );
    }

    const previousPath = existing[idx].photo_url ?? null;
    if (previousPath) {
      await deleteCheckInPhoto(previousPath);
    }

    const next = [...existing];
    next[idx] = { ...next[idx], photo_url: null };
    await personRef.update({
      "child_profile.authorized_pickups": next,
      updated_at: new Date().toISOString(),
    });

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "pickup.authorized_photo_removed",
      target_type: "person",
      target_id: childId,
      metadata: { pickup_id: pickupId },
      outcome: "ok",
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error(
      "[DELETE /api/admin/checkin/authorized-pickups/[id]/photo]",
      error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
