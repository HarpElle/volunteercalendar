import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import type { Schedule } from "@/lib/types";
import { fanOutScheduleStatus } from "@/lib/server/schedule-status-fanout";
import { assertBearerToken, requireMembership } from "@/lib/server/authz";
import { parseBody, z } from "@/lib/server/validation";

const ApproveBodySchema = z.object({
  church_id: z.string().min(1),
  ministry_id: z.string().min(1),
  status: z.enum(["pending", "approved", "rejected"]),
  notes: z.string().optional(),
});

/**
 * PATCH /api/schedules/{id}/approve
 *
 * Mark a ministry's assignments as approved (or rejected) in the schedule.
 * Requires the caller to be a ministry lead for the specified ministry,
 * OR a scheduler scoped to this ministry, OR admin/owner.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const noAuth = assertBearerToken(req);
  if (noAuth) return noAuth;

  const body = await parseBody(req, ApproveBodySchema);
  if (body instanceof NextResponse) return body;

  // Authenticate the caller as ANY active member of the church first;
  // the ministry-lead / ministry-scheduler check happens below since
  // it's more nuanced than a simple role threshold.
  const auth = await requireMembership(req, body.church_id, "volunteer");
  if (auth instanceof NextResponse) return auth;

  const { id: scheduleId } = await params;
  const { church_id, ministry_id, status, notes } = body;
  const userId = auth.uid;

  try {

    // Must be admin/owner OR a scheduler with scope for this ministry
    const isAdmin = auth.role === "admin" || auth.role === "owner";
    const isMinistryScheduler =
      auth.role === "scheduler" &&
      (auth.ministry_scope.length === 0 || auth.ministry_scope.includes(ministry_id));

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

    // Wave 2.2: when the final ministry approval flips the schedule to
    // "approved", denormalize the new status onto every child assignment.
    // (Single-ministry approvals that don't trigger a schedule-level
    // status change skip this — no fan-out needed.)
    if (allApproved && status === "approved") {
      await fanOutScheduleStatus(church_id, scheduleId, "approved");
    }

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
