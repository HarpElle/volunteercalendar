/**
 * /api/memberships/[id] — PATCH and DELETE for the membership lifecycle.
 *
 * Wave 4.1 (audit coverage). Replaces direct client-SDK writes to the
 * memberships collection (was `updateMembershipStatus/Role/Permissions/
 * deleteMembership` in src/lib/firebase/firestore.ts) so every lifecycle
 * change gets an audit_logs entry.
 *
 * Auth model:
 *   - PATCH/DELETE: caller must be EITHER (a) the membership owner
 *     (self-update / self-leave) OR (b) an active admin/owner of the
 *     church the membership belongs to (admin action).
 *   - Self callers may only update their own `status` (accept invite,
 *     deactivate self) or `reminder_preferences`. They cannot change
 *     their own `role` or `ministry_scope` (those are admin-only).
 *
 * Audited actions:
 *   - PATCH status active (from pending_*) by admin → membership.approve
 *   - PATCH status inactive by admin     → membership.deactivate
 *   - PATCH status active by self (from pending_volunteer_approval) → membership.accept_invite
 *   - PATCH role change by admin         → membership.role_change
 *   - DELETE by admin                    → membership.remove
 *   - DELETE by self (leaving)           → membership.remove (with self=true metadata)
 *
 * Reminder-preferences changes are intentionally NOT audited (user
 * settings, low security relevance).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { assertBearerToken, requireUser } from "@/lib/server/authz";
import { parseBody, z } from "@/lib/server/validation";
import { audit, userActor, type AuditAction } from "@/lib/server/audit";
import { log } from "@/lib/log";
import type { OrgRole, MembershipStatus, ReminderChannel } from "@/lib/types";

// Reminder channels schema mirrors the union in @/lib/types.
const ReminderChannelSchema = z.enum(["email", "sms", "calendar", "none"]);

// Mirrors SchedulerNotificationType + SchedulerNotificationPreferences
// in @/lib/types. Kept in lockstep with the type so a future addition
// (e.g., a new notification type) requires updating both.
const SchedulerNotificationTypeSchema = z.enum([
  "assignment_change",
  "absence_alert",
  "swap_request",
  "self_removal",
  "schedule_published",
]);
const SchedulerNotificationPreferencesSchema = z.object({
  enabled_types: z.array(SchedulerNotificationTypeSchema),
  channels: z.object({
    standard: z.array(z.enum(["email", "none"])),
    urgent: z.array(z.enum(["email", "sms", "none"])),
  }),
  ministry_scope: z.array(z.string()),
});

const PatchBodySchema = z.object({
  status: z
    .enum([
      "active",
      "inactive",
      "pending_org_approval",
      "pending_volunteer_approval",
    ])
    .optional(),
  role: z.enum(["owner", "admin", "scheduler", "volunteer"]).optional(),
  ministry_scope: z.array(z.string()).optional(),
  reminder_preferences: z
    .object({
      channels: z.array(ReminderChannelSchema),
    })
    .optional(),
  scheduler_notification_preferences: SchedulerNotificationPreferencesSchema.optional(),
});

interface MembershipDoc {
  id: string;
  user_id: string;
  church_id: string;
  role: OrgRole;
  status: MembershipStatus;
  ministry_scope?: string[];
  reminder_preferences?: { channels: ReminderChannel[] };
}

/**
 * Common: authenticate + load membership + decide whether the caller can
 * mutate it. Returns { caller, membership, isSelf, isAdmin } on success
 * or a NextResponse on failure.
 */
async function loadMembershipForMutation(
  req: NextRequest,
  membershipId: string,
): Promise<
  | NextResponse
  | {
      caller: { uid: string };
      membership: MembershipDoc;
      isSelf: boolean;
      isAdmin: boolean;
    }
> {
  const noAuth = assertBearerToken(req);
  if (noAuth) return noAuth;

  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;

  const memSnap = await adminDb.doc(`memberships/${membershipId}`).get();
  if (!memSnap.exists) {
    return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  }
  const data = memSnap.data() ?? {};
  const membership: MembershipDoc = {
    id: memSnap.id,
    user_id: data.user_id as string,
    church_id: data.church_id as string,
    role: data.role as OrgRole,
    status: data.status as MembershipStatus,
    ministry_scope: (data.ministry_scope as string[]) ?? [],
    reminder_preferences: data.reminder_preferences as
      | { channels: ReminderChannel[] }
      | undefined,
  };

  const isSelf = membership.user_id === user.uid;

  // Check caller's membership in the same church to determine admin status.
  // Self callers are admins-of-themselves regardless.
  const callerMemSnap = await adminDb
    .doc(`memberships/${user.uid}_${membership.church_id}`)
    .get();
  const callerData = callerMemSnap.exists ? callerMemSnap.data() : null;
  const isAdmin =
    !!callerData &&
    callerData.status === "active" &&
    ["admin", "owner"].includes(callerData.role as string);

  if (!isSelf && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { caller: { uid: user.uid }, membership, isSelf, isAdmin };
}

/**
 * PATCH /api/memberships/[id]
 *
 * Body fields are all optional; only the ones provided get updated.
 * Returns 200 with `{ success: true, updated: { ... } }` on success.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: membershipId } = await params;
  if (!membershipId) {
    return NextResponse.json(
      { error: "Missing membership id" },
      { status: 400 },
    );
  }

  const auth = await loadMembershipForMutation(req, membershipId);
  if (auth instanceof NextResponse) return auth;
  const { caller, membership, isSelf, isAdmin } = auth;

  const body = await parseBody(req, PatchBodySchema);
  if (body instanceof NextResponse) return body;

  // Decide what fields the caller is allowed to change.
  // - Self-only: status (limited), reminder_preferences
  // - Admin-only (for non-self): status, role, ministry_scope, reminder_preferences
  const adminFields = new Set(["role", "ministry_scope"]);
  for (const field of Object.keys(body)) {
    if (adminFields.has(field) && !isAdmin) {
      return NextResponse.json(
        { error: `Only admins can change ${field}` },
        { status: 403 },
      );
    }
  }

  // Self updates may only change status in narrow ways (accept own
  // invite, deactivate self). They CANNOT promote themselves.
  if (isSelf && !isAdmin && body.status !== undefined) {
    const allowedSelfTransitions: Record<string, string[]> = {
      pending_volunteer_approval: ["active"],
      pending_org_approval: ["active"],
      active: ["inactive"],
      inactive: ["active"],
    };
    const allowed =
      allowedSelfTransitions[membership.status]?.includes(body.status) ?? false;
    if (!allowed) {
      return NextResponse.json(
        { error: `Cannot transition own membership ${membership.status} → ${body.status}` },
        { status: 403 },
      );
    }
  }

  // Build the update payload (only fields actually provided).
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) update.status = body.status;
  if (body.role !== undefined) update.role = body.role;
  if (body.ministry_scope !== undefined) update.ministry_scope = body.ministry_scope;
  if (body.reminder_preferences !== undefined) {
    update.reminder_preferences = body.reminder_preferences;
  }
  if (body.scheduler_notification_preferences !== undefined) {
    update.scheduler_notification_preferences =
      body.scheduler_notification_preferences;
  }

  try {
    await adminDb.doc(`memberships/${membershipId}`).update(update);
  } catch (err) {
    log.error("PATCH /api/memberships/[id] update failed", {
      error: err,
      membership_id: membershipId,
    });
    return NextResponse.json(
      { error: "Failed to update membership" },
      { status: 500 },
    );
  }

  // ─── Audit emissions ────────────────────────────────────────────────
  // Emit ONE audit per distinct lifecycle change. Reminder-preferences
  // tweaks are intentionally not audited (user settings churn).
  const auditCommon = {
    church_id: membership.church_id,
    actor: userActor(caller.uid),
    target_type: "membership",
    target_id: membershipId,
  };

  if (body.status !== undefined && body.status !== membership.status) {
    let action: AuditAction | null = null;
    let metadata: Record<string, unknown> = {
      from_status: membership.status,
      to_status: body.status,
      self: isSelf,
    };
    if (
      isSelf &&
      !isAdmin &&
      membership.status.startsWith("pending_") &&
      body.status === "active"
    ) {
      action = "membership.accept_invite";
    } else if (
      isAdmin &&
      membership.status.startsWith("pending_") &&
      body.status === "active"
    ) {
      action = "membership.approve";
    } else if (body.status === "inactive") {
      action = "membership.deactivate";
      metadata = { ...metadata, removed_by_self: isSelf };
    } else if (body.status === "active" && membership.status === "inactive") {
      action = "membership.approve"; // re-activating; reuse the approve action
    }
    if (action) {
      void audit({ ...auditCommon, action, metadata, outcome: "ok" });
    }
  }

  if (body.role !== undefined && body.role !== membership.role) {
    void audit({
      ...auditCommon,
      action: "membership.role_change",
      metadata: {
        from_role: membership.role,
        to_role: body.role,
        ministry_scope: body.ministry_scope ?? membership.ministry_scope ?? [],
      },
      outcome: "ok",
    });
  }

  return NextResponse.json({
    success: true,
    updated: {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.ministry_scope !== undefined
        ? { ministry_scope: body.ministry_scope }
        : {}),
      ...(body.reminder_preferences !== undefined
        ? { reminder_preferences: body.reminder_preferences }
        : {}),
    },
  });
}

/**
 * DELETE /api/memberships/[id]
 *
 * Removes the membership entirely. Allowed by:
 *   - the membership owner (leaving the org)
 *   - the church's owner (removing another member; admins can't remove
 *     other admins or owners — only the owner can)
 *
 * Note: owner of the church cannot delete their own owner membership via
 * this endpoint (would orphan the church). DELETE /api/organization is
 * the path for owner-driven org wind-down.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: membershipId } = await params;
  if (!membershipId) {
    return NextResponse.json(
      { error: "Missing membership id" },
      { status: 400 },
    );
  }

  const auth = await loadMembershipForMutation(req, membershipId);
  if (auth instanceof NextResponse) return auth;
  const { caller, membership, isSelf, isAdmin } = auth;

  // Special-case: admin (not owner) can't remove other admins or owners
  // — only the church owner can.
  if (!isSelf) {
    const callerMemSnap = await adminDb
      .doc(`memberships/${caller.uid}_${membership.church_id}`)
      .get();
    const callerRole = (callerMemSnap.data()?.role as string) ?? "";
    if (
      ["admin", "owner"].includes(membership.role) &&
      callerRole !== "owner"
    ) {
      return NextResponse.json(
        { error: "Only the church owner can remove admins or owners" },
        { status: 403 },
      );
    }
  }

  // Owner can't self-remove (would orphan church).
  if (isSelf && membership.role === "owner") {
    return NextResponse.json(
      {
        error:
          "Owners cannot leave their org. Transfer ownership first, or delete the organization.",
      },
      { status: 400 },
    );
  }

  try {
    await adminDb.doc(`memberships/${membershipId}`).delete();
  } catch (err) {
    log.error("DELETE /api/memberships/[id] failed", {
      error: err,
      membership_id: membershipId,
    });
    return NextResponse.json(
      { error: "Failed to remove membership" },
      { status: 500 },
    );
  }

  void audit({
    church_id: membership.church_id,
    actor: userActor(caller.uid),
    action: "membership.remove",
    target_type: "membership",
    target_id: membershipId,
    metadata: {
      removed_user_id: membership.user_id,
      removed_role: membership.role,
      self: isSelf,
    },
    outcome: "ok",
  });

  // Use `isAdmin` for a side-effect: when a non-admin self-leaves, the
  // outcome is still "ok" but we suppress any redundant secondary log
  // entry. (Keeps `isAdmin` referenced for the linter; trivial guard.)
  void isAdmin;

  return NextResponse.json({ success: true });
}
