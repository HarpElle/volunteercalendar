/**
 * Photo upload + delete for an authorized-pickup contact.
 *
 * Wave 9 P0-2 sub-PR C (re-land after path-pattern fix). Multipart
 * upload writes to Storage via `uploadCheckInPhoto()`; the resulting
 * storage path is persisted as `photo_url` on the contact. Reads of
 * the photo are NEVER unsigned — the UI calls /api/admin/checkin/photo
 * for a short-TTL signed URL on demand.
 *
 * 2026-06-03 sibling-scope extension: handles both per-child and
 * household-scope pickup photos. Scope is read from a form field
 * (POST) / query param (DELETE); the `household_id` and `child_id`
 * fields are interchangeable targets gated by scope. Defaults to
 * `scope=child` for backwards-compat.
 *
 * Path pattern note: this used to live at
 * `children/[personId]/authorized-pickups/[pickupId]/photo/route.ts`,
 * but Next.js 16's app-router bundler chokes on
 * `[param]/static/[param]/route.ts` (verified PR #154). Flattening to
 * `authorized-pickups/[id]/photo` with `child_id` / `household_id`
 * as form/query fields avoids the bug entirely.
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
  getChildPrivateMedical,
  writeChildPrivateMedical,
} from "@/lib/server/child-medical";
import {
  CHECKIN_PHOTO_ALLOWED_TYPES,
  CHECKIN_PHOTO_MAX_BYTES,
  deleteCheckInPhoto,
  uploadCheckInPhoto,
} from "@/lib/server/checkin-photos";

type Scope = "child" | "household";

function readScope(raw: unknown): Scope {
  return raw === "household" ? "household" : "child";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: pickupId } = await params;

    const formData = await req.formData();
    const churchIdField = formData.get("church_id");
    if (typeof churchIdField !== "string" || !churchIdField.trim()) {
      return NextResponse.json(
        { error: "church_id form field is required" },
        { status: 400 },
      );
    }

    const scopeField = formData.get("scope");
    const scope = readScope(scopeField);

    let childId = "";
    let householdId = "";
    if (scope === "child") {
      const childIdField = formData.get("child_id");
      if (typeof childIdField !== "string" || !childIdField.trim()) {
        return NextResponse.json(
          { error: "child_id form field is required when scope=child" },
          { status: 400 },
        );
      }
      childId = childIdField.trim();
    } else {
      const householdIdField = formData.get("household_id");
      if (typeof householdIdField !== "string" || !householdIdField.trim()) {
        return NextResponse.json(
          { error: "household_id form field is required when scope=household" },
          { status: 400 },
        );
      }
      householdId = householdIdField.trim();
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

    const churchRef = adminDb.collection("churches").doc(churchId);
    const targetRef =
      scope === "child"
        ? churchRef.collection("people").doc(childId)
        : churchRef.collection("households").doc(householdId);
    // Only used by the household branch below; the child branch writes the
    // private medical subdoc via writeChildPrivateMedical (Phase 3).
    const fieldKey = "authorized_pickups";

    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      return NextResponse.json(
        { error: scope === "child" ? "Child not found" : "Household not found" },
        { status: 404 },
      );
    }
    const targetData = targetSnap.data() ?? {};
    if (targetData.church_id !== churchId) {
      return NextResponse.json(
        { error: "Cross-tenant access denied" },
        { status: 403 },
      );
    }
    if (scope === "child" && targetData.person_type !== "child") {
      return NextResponse.json(
        { error: "Target person is not a child" },
        { status: 400 },
      );
    }
    // Phase 3: for child scope, the pickups array lives in the private
    // medical subdoc (not the parent people doc validated above). Read it
    // here and keep `childMedical` for the write-back below. Household
    // scope reads the array straight off the household doc as before.
    const childMedical =
      scope === "child"
        ? await getChildPrivateMedical(churchRef, childId)
        : null;
    const existingPickups: PersonAuthorizedPickup[] =
      scope === "child"
        ? childMedical!.authorized_pickups
        : Array.isArray(targetData.authorized_pickups)
          ? targetData.authorized_pickups
          : [];
    const pickupIdx = existingPickups.findIndex((p) => p.id === pickupId);
    if (pickupIdx === -1) {
      return NextResponse.json(
        { error: "Authorized-pickup entry not found" },
        { status: 404 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { storage_path } = await uploadCheckInPhoto({
      churchId,
      kind: "authorized",
      id: pickupId,
      buffer,
      contentType: file.type,
      uploadedBy: userId,
    });

    const previousPath = existingPickups[pickupIdx].photo_url ?? null;
    if (previousPath && previousPath !== storage_path) {
      await deleteCheckInPhoto(previousPath);
    }

    const nextPickups = [...existingPickups];
    nextPickups[pickupIdx] = {
      ...nextPickups[pickupIdx],
      photo_url: storage_path,
    };
    if (scope === "child") {
      // Phase 3: write the photo metadata back to the private medical
      // subdoc, NOT the parent people doc.
      writeChildPrivateMedical(
        churchRef,
        childId,
        { ...childMedical!, authorized_pickups: nextPickups },
        new Date().toISOString(),
      );
    } else {
      await targetRef.update({
        [fieldKey]: nextPickups,
        updated_at: new Date().toISOString(),
      });
    }

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "pickup.authorized_photo_added",
      target_type: scope === "child" ? "person" : "household",
      target_id: scope === "child" ? childId : householdId,
      metadata: {
        pickup_id: pickupId,
        content_type: file.type,
        bytes: file.size,
        scope,
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
    const targetRef =
      scope === "child"
        ? churchRef.collection("people").doc(childId!)
        : churchRef.collection("households").doc(householdId!);
    // Only used by the household branch below; the child branch writes the
    // private medical subdoc via writeChildPrivateMedical (Phase 3).
    const fieldKey = "authorized_pickups";

    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      return NextResponse.json(
        { error: scope === "child" ? "Child not found" : "Household not found" },
        { status: 404 },
      );
    }
    const data = targetSnap.data() ?? {};
    if (data.church_id !== churchId) {
      return NextResponse.json(
        { error: "Cross-tenant access denied" },
        { status: 403 },
      );
    }
    // Phase 3: for child scope, the pickups array lives in the private
    // medical subdoc; read it here and keep `childMedical` for write-back.
    const childMedical =
      scope === "child"
        ? await getChildPrivateMedical(churchRef, childId!)
        : null;
    const existing: PersonAuthorizedPickup[] =
      scope === "child"
        ? childMedical!.authorized_pickups
        : Array.isArray(data.authorized_pickups)
          ? data.authorized_pickups
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
    if (scope === "child") {
      // Phase 3: write back to the private medical subdoc, NOT the parent.
      writeChildPrivateMedical(
        churchRef,
        childId!,
        { ...childMedical!, authorized_pickups: next },
        new Date().toISOString(),
      );
    } else {
      await targetRef.update({
        [fieldKey]: next,
        updated_at: new Date().toISOString(),
      });
    }

    void audit({
      church_id: churchId,
      actor: userActor(userId),
      action: "pickup.authorized_photo_removed",
      target_type: scope === "child" ? "person" : "household",
      target_id: scope === "child" ? childId! : householdId!,
      metadata: { pickup_id: pickupId, scope },
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
