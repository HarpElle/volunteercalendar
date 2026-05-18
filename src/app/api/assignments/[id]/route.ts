import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { AssignmentType } from "@/lib/types";

interface PatchBody {
  church_id: string;
  assignment_type?: AssignmentType;
}

/**
 * PATCH /api/assignments/{id}
 *
 * Update an assignment's mutable scheduler-only fields. Right now this is
 * limited to `assignment_type` so admins can flip a slot between
 * `regular` and `trainee` (shadow) from the schedule matrix.
 *
 * Codex Run 3 retest (2026-05-17): trainee state was settable only via
 * direct Firestore writes — there was no UI path. This endpoint pairs with
 * the new Regular/Trainee toggle in the schedule matrix chip menu.
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
    const { id: assignmentId } = await params;

    const body = (await req.json()) as PatchBody;
    const { church_id, assignment_type } = body;

    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }
    if (assignment_type && !["regular", "trainee"].includes(assignment_type)) {
      return NextResponse.json(
        { error: "assignment_type must be 'regular' or 'trainee'" },
        { status: 400 },
      );
    }

    // Verify admin/scheduler role
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json(
        { error: "Only schedulers and admins can update assignments" },
        { status: 403 },
      );
    }

    const assignmentRef = adminDb
      .collection("churches")
      .doc(church_id)
      .collection("assignments")
      .doc(assignmentId);

    const snap = await assignmentRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const update: Record<string, unknown> = {};
    if (assignment_type) update.assignment_type = assignment_type;

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update" },
        { status: 400 },
      );
    }

    await assignmentRef.update(update);

    return NextResponse.json({ success: true, ...update });
  } catch (error) {
    console.error("[PATCH /api/assignments/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
