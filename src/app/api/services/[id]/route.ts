import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { EditScope, MinistryAssignment, ServiceChangeRecord, Service } from "@/lib/types";
import { validateMinistryAssignments } from "@/lib/utils/validate-ministry-assignments";
import { generateOccurrences } from "@/lib/services/scheduler";

interface PatchBody {
  church_id: string;
  /** The ministry assignments to apply. */
  ministry_assignments?: MinistryAssignment[];
  /** When this change takes effect. */
  effective_from_date?: string;
  /** How to apply the change. */
  edit_scope?: EditScope;
  /** Change metadata. */
  change_type?: ServiceChangeRecord["change_type"];
  previous_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
}

/**
 * PATCH /api/services/{id}
 *
 * Update a service profile with effective-from date logic.
 * Supports timeline-based changes that don't retroactively modify published schedules.
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
    const { id: serviceId } = await params;

    const body = (await req.json()) as PatchBody;
    const { church_id, ministry_assignments, effective_from_date, edit_scope, change_type, previous_value, new_value } = body;

    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify membership + admin/scheduler role
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const membership = membershipSnap.data()!;
    const role = membership.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const churchRef = adminDb.collection("churches").doc(church_id);
    const serviceRef = churchRef.collection("services").doc(serviceId);
    const serviceSnap = await serviceRef.get();

    if (!serviceSnap.exists) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    const service = { id: serviceSnap.id, ...serviceSnap.data()! } as Service;

    // If updating ministry assignments with timeline logic
    if (ministry_assignments && effective_from_date && edit_scope) {
      const now = new Date().toISOString();
      let effectiveDate = effective_from_date;

      // Compute effective date for "next" scope
      if (edit_scope === "next") {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const farFuture = new Date();
        farFuture.setDate(farFuture.getDate() + 60);
        const occurrences = generateOccurrences(
          [service],
          tomorrow.toISOString().split("T")[0],
          farFuture.toISOString().split("T")[0],
        );
        if (occurrences.length > 0) {
          effectiveDate = occurrences[0].date;
        }
      }

      // Build the new ministry_assignments array
      const existing = service.ministry_assignments || [];
      let updated: MinistryAssignment[];

      if (edit_scope === "single_date") {
        // One-off override: add assignments with effective_from === effective_until
        const newEntries: MinistryAssignment[] = ministry_assignments.map((ma) => ({
          ...ma,
          effective_from: effectiveDate,
          effective_until: effectiveDate,
          created_at: now,
          updated_by: userId,
        }));
        updated = [...existing, ...newEntries];
      } else {
        // Close out current open-ended assignments for affected ministries
        const affectedMinistryIds = new Set(ministry_assignments.map((ma) => ma.ministry_id));
        const closed = existing.map((ma) => {
          if (affectedMinistryIds.has(ma.ministry_id) && ma.effective_until === null) {
            // Close this assignment the day before the new one takes effect
            const endDate = new Date(effectiveDate);
            endDate.setDate(endDate.getDate() - 1);
            return { ...ma, effective_until: endDate.toISOString().split("T")[0] };
          }
          return ma;
        });

        // Add new assignments starting from the effective date
        const newEntries: MinistryAssignment[] = ministry_assignments.map((ma) => ({
          ...ma,
          effective_from: effectiveDate,
          effective_until: null,
          created_at: now,
          updated_by: userId,
        }));
        updated = [...closed, ...newEntries];
      }

      // Validate no overlapping ranges
      const errors = validateMinistryAssignments(updated);
      if (errors.length > 0) {
        return NextResponse.json(
          { error: "Validation failed", details: errors },
          { status: 422 },
        );
      }

      // Build change history entry
      const changeRecord: ServiceChangeRecord = {
        change_type: change_type || "role_modified",
        effective_from: effectiveDate,
        previous_value: previous_value || {},
        new_value: new_value || {},
        changed_by: userId,
        changed_at: now,
      };

      const existingHistory = service.change_history || [];

      // Check for affected published schedules (warning, not blocker)
      const scheduleSnap = await churchRef
        .collection("schedules")
        .where("status", "in", ["published", "approved", "in_review"])
        .get();

      const affectedSchedules = scheduleSnap.docs.filter((doc) => {
        const data = doc.data();
        return data.date_range_end >= effectiveDate;
      });

      // Persist
      await serviceRef.update({
        ministry_assignments: updated,
        change_history: [...existingHistory, changeRecord],
      });

      return NextResponse.json({
        success: true,
        effective_from: effectiveDate,
        ministry_assignment_count: updated.length,
        affected_schedules: affectedSchedules.map((d) => ({
          id: d.id,
          status: d.data().status,
          date_range: `${d.data().date_range_start} to ${d.data().date_range_end}`,
        })),
      });
    }

    // Generic update (non-timeline fields like name, recurrence, times)
    const updateFields: Record<string, unknown> = {};
    const allowedFields = ["name", "recurrence", "day_of_week", "start_time", "end_time", "all_day", "campus_id", "ministries", "roles"];
    for (const key of allowedFields) {
      if (key in body) {
        updateFields[key] = (body as unknown as Record<string, unknown>)[key];
      }
    }

    if (Object.keys(updateFields).length > 0) {
      await serviceRef.update(updateFields);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PATCH /api/services/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
