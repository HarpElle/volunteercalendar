import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { Schedule, ApprovalStatus } from "@/lib/types";

interface ApproveBody {
  church_id: string;
  ministry_id: string;
  status: ApprovalStatus;
  notes?: string;
}

/**
 * PATCH /api/schedules/{id}/approve
 *
 * Mark a ministry's assignments as approved (or rejected) in the schedule.
 * Requires the caller to be a ministry lead for the specified ministry.
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
    const { id: scheduleId } = await params;

    const body = (await req.json()) as ApproveBody;
    const { church_id, ministry_id, status, notes } = body;

    if (!church_id || !ministry_id || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify membership + permissions
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const membership = membershipSnap.data()!;
    const role = membership.role as string;
    const ministryScope = (membership.ministry_scope as string[]) || [];

    // Must be admin/owner OR a scheduler with scope for this ministry
    const isAdmin = ["owner", "admin"].includes(role);
    const isMinistryScheduler =
      role === "scheduler" &&
      (ministryScope.length === 0 || ministryScope.includes(ministry_id));

    // Also allow if they're the ministry lead
    const churchRef = adminDb.collection("churches").doc(church_id);
    const ministrySnap = await churchRef.collection("ministries").doc(ministry_id).get();
    const isMinistryLead = ministrySnap.exists && ministrySnap.data()?.lead_user_id === userId;

    if (!isAdmin && !isMinistryScheduler && !isMinistryLead) {
      return NextResponse.json(
        { error: "You must be an admin, scheduler, or ministry lead for this team" },
        { status: 403 },
      );
    }

    const scheduleRef = churchRef.collection("schedules").doc(scheduleId);
    const scheduleSnap = await scheduleRef.get();

    if (!scheduleSnap.exists) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const schedule = { id: scheduleSnap.id, ...scheduleSnap.data()! } as Schedule;

    // Must be in review status
    if (!["in_review", "draft"].includes(schedule.status)) {
      return NextResponse.json(
        { error: `Cannot approve schedule in "${schedule.status}" status` },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    // Update the ministry approval
    const approvalUpdate: Record<string, unknown> = {
      [`ministry_approvals.${ministry_id}.status`]: status,
      [`ministry_approvals.${ministry_id}.approved_by`]: userId,
      [`ministry_approvals.${ministry_id}.approved_at`]: now,
      [`ministry_approvals.${ministry_id}.notes`]: notes || null,
    };

    // Check if all ministries are now approved
    const updatedApprovals = { ...schedule.ministry_approvals };
    updatedApprovals[ministry_id] = {
      status,
      approved_by: userId,
      approved_at: now,
      notes: notes || null,
    };

    const allApproved = Object.values(updatedApprovals).every(
      (a) => a.status === "approved",
    );

    if (allApproved && status === "approved") {
      approvalUpdate["status"] = "approved";
      approvalUpdate["approval_workflow.approved_at"] = now;
    }

    await scheduleRef.update(approvalUpdate);

    return NextResponse.json({
      success: true,
      ministry_id,
      status,
      all_approved: allApproved && status === "approved",
    });
  } catch (error) {
    console.error("[PATCH /api/schedules/[id]/approve]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
