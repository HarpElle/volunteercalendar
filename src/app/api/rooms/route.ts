import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { randomBytes } from "crypto";
import { TIER_LIMITS } from "@/lib/constants";

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

/**
 * GET /api/rooms?church_id=...&include_inactive=true
 * List rooms for a church.
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

    const includeInactive =
      req.nextUrl.searchParams.get("include_inactive") === "true";

    let query = adminDb
      .collection(`churches/${churchId}/rooms`)
      .orderBy("name");

    if (!includeInactive) {
      query = query.where("is_active", "==", true);
    }

    const snap = await query.get();
    const rooms = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ rooms });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/rooms
 * Create a new room. Requires admin role.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { church_id, name } = body;
    if (!church_id || !name?.trim()) {
      return NextResponse.json(
        { error: "Missing church_id or name" },
        { status: 400 },
      );
    }

    const role = await getMembershipRole(userId, church_id);
    if (!role || !["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    // Check tier limit
    const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
    const tier = (churchSnap.data()?.subscription_tier || "free") as string;
    const limits = TIER_LIMITS[tier];
    if (!limits?.rooms_enabled) {
      return NextResponse.json(
        { error: "Room booking requires Starter tier or higher" },
        { status: 403 },
      );
    }

    // Check rooms_max
    const existingSnap = await adminDb
      .collection(`churches/${church_id}/rooms`)
      .where("is_active", "==", true)
      .get();
    if (existingSnap.size >= limits.rooms_max) {
      return NextResponse.json(
        {
          error: `Room limit reached (${limits.rooms_max}). Upgrade your plan for more rooms.`,
        },
        { status: 403 },
      );
    }

    const now = new Date().toISOString();
    const docRef = adminDb.collection(`churches/${church_id}/rooms`).doc();
    const room = {
      id: docRef.id,
      church_id,
      name: name.trim(),
      description: body.description?.trim() || "",
      capacity: body.capacity || null,
      location: body.location?.trim() || "",
      campus_id: body.campus_id || null,
      equipment: body.equipment || [],
      photo_url: body.photo_url || null,
      suggested_ministry_ids: body.suggested_ministry_ids || [],
      is_active: true,
      display_public: body.display_public ?? false,
      public_visible: body.public_visible ?? false,
      calendar_token: randomBytes(16).toString("hex"),
      created_by: userId,
      created_at: now,
      updated_at: now,
    };

    await docRef.set(room);
    return NextResponse.json({ room }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
