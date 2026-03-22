import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { randomBytes } from "crypto";

async function verifyAuth(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  return decoded.uid;
}

async function getMembershipRole(userId: string, churchId: string) {
  const snap = await adminDb.doc(`memberships/${userId}_${churchId}`).get();
  if (!snap.exists) return null;
  return snap.data()!.role as string;
}

const DEFAULTS = {
  equipment_tags: [],
  require_approval: false,
  max_advance_days: 90,
  default_setup_minutes: 0,
  default_teardown_minutes: 0,
  public_calendar_enabled: false,
  conflict_notification_user_ids: [],
};

/**
 * GET /api/rooms/settings?church_id=...
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const role = await getMembershipRole(userId, churchId);
    if (!role) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const snap = await adminDb
      .doc(`churches/${churchId}/roomSettings/config`)
      .get();

    if (!snap.exists) {
      return NextResponse.json({ settings: DEFAULTS });
    }

    return NextResponse.json({ settings: snap.data() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/rooms/settings
 * Update room settings. Requires admin role.
 */
export async function PUT(req: NextRequest) {
  try {
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { church_id } = body;
    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const role = await getMembershipRole(userId, church_id);
    if (!role || !["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const ref = adminDb.doc(`churches/${church_id}/roomSettings/config`);
    const snap = await ref.get();
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = {
      updated_by: userId,
      updated_at: now,
    };

    if (body.equipment_tags !== undefined)
      updates.equipment_tags = body.equipment_tags;
    if (body.require_approval !== undefined)
      updates.require_approval = body.require_approval;
    if (body.max_advance_days !== undefined)
      updates.max_advance_days = body.max_advance_days;
    if (body.default_setup_minutes !== undefined)
      updates.default_setup_minutes = body.default_setup_minutes;
    if (body.default_teardown_minutes !== undefined)
      updates.default_teardown_minutes = body.default_teardown_minutes;
    if (body.public_calendar_enabled !== undefined)
      updates.public_calendar_enabled = body.public_calendar_enabled;
    if (body.conflict_notification_user_ids !== undefined)
      updates.conflict_notification_user_ids =
        body.conflict_notification_user_ids;

    if (!snap.exists) {
      updates.public_calendar_token = randomBytes(16).toString("hex");
      await ref.set({ ...DEFAULTS, ...updates });
    } else {
      await ref.update(updates);
    }

    const updated = await ref.get();
    return NextResponse.json({ settings: updated.data() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
