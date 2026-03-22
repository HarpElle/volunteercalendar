import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/service-plans/{id}?church_id=...
 *
 * Fetch a single service plan by id.
 * Requires authenticated membership in the church.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;
    const { id: planId } = await params;

    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify membership
    const membershipId = `${userId}_${churchId}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const planRef = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("service_plans")
      .doc(planId);
    const planSnap = await planRef.get();

    if (!planSnap.exists) {
      return NextResponse.json({ error: "Service plan not found" }, { status: 404 });
    }

    return NextResponse.json({
      plan: { id: planSnap.id, ...planSnap.data() },
    });
  } catch (error) {
    console.error("[GET /api/service-plans/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/service-plans/{id}
 *
 * Update a service plan's metadata or items array.
 * The items array is replaced wholesale (supports drag-drop reordering).
 * Requires admin or scheduler role.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;
    const { id: planId } = await params;

    const body = await req.json();
    const { church_id, ...updates } = body as {
      church_id: string;
      items?: unknown[];
      theme?: string | null;
      speaker?: string | null;
      scripture_references?: string[];
      notes?: string | null;
      service_date?: string;
    };

    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify membership with admin/scheduler role
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const churchRef = adminDb.collection("churches").doc(church_id);
    const planRef = churchRef.collection("service_plans").doc(planId);
    const planSnap = await planRef.get();

    if (!planSnap.exists) {
      return NextResponse.json({ error: "Service plan not found" }, { status: 404 });
    }

    // Build the update payload from allowed fields
    const allowedFields = [
      "items",
      "theme",
      "speaker",
      "scripture_references",
      "notes",
      "service_date",
    ];
    const updateData: Record<string, unknown> = { updated_by: userId };

    for (const field of allowedFields) {
      if (field in updates) {
        updateData[field] = (updates as Record<string, unknown>)[field];
      }
    }

    await planRef.update(updateData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PATCH /api/service-plans/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/service-plans/{id}
 *
 * Delete a service plan. Only allowed if the plan has not been published.
 * Requires admin or scheduler role.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;
    const { id: planId } = await params;

    const { church_id } = (await req.json()) as { church_id: string };

    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify membership with admin/scheduler role
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const churchRef = adminDb.collection("churches").doc(church_id);
    const planRef = churchRef.collection("service_plans").doc(planId);
    const planSnap = await planRef.get();

    if (!planSnap.exists) {
      return NextResponse.json({ error: "Service plan not found" }, { status: 404 });
    }

    const planData = planSnap.data()!;
    if (planData.published) {
      return NextResponse.json(
        { error: "Cannot delete a published service plan" },
        { status: 409 },
      );
    }

    await planRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/service-plans/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
