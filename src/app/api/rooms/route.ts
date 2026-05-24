import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { randomBytes } from "crypto";
import { TIER_LIMITS } from "@/lib/constants";
import { requireModuleTier } from "@/lib/server/require-module-tier";

/**
 * GET /api/rooms?church_id=...&include_inactive=true
 * List rooms for a church.
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireModuleTier(req, "rooms");
    if (!gate.ok) return gate.response;
    const { churchId } = gate.ctx;

    const includeInactive =
      req.nextUrl.searchParams.get("include_inactive") === "true";

    // Avoid combining where() + orderBy() on different fields — Firestore would
    // require a composite index for (is_active, name) and the query 500s with
    // a confusing error until that index is built. Fetch by filter only and
    // sort by name client-side. Room lists per-church are small enough that
    // this is a non-issue performance-wise.
    let query: FirebaseFirestore.Query = adminDb.collection(
      `churches/${churchId}/rooms`,
    );

    if (!includeInactive) {
      query = query.where("is_active", "==", true);
    }

    const snap = await query.get();
    const rooms = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as { id: string; name?: string })
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
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
    const gate = await requireModuleTier(req, "rooms", {
      churchIdFrom: "body",
    });
    if (!gate.ok) return gate.response;
    const { userId, churchId, tier, role } = gate.ctx;

    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { name } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    // Check rooms_max (module-enabled check already done by requireModuleTier).
    const limits = TIER_LIMITS[tier];
    const existingSnap = await adminDb
      .collection(`churches/${churchId}/rooms`)
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
    const docRef = adminDb.collection(`churches/${churchId}/rooms`).doc();
    const room = {
      id: docRef.id,
      church_id: churchId,
      name: name.trim(),
      description: body.description?.trim() || "",
      capacity: body.capacity || null,
      location: body.location?.trim() || "",
      campus_id: body.campus_id || null,
      equipment: Array.isArray(body.equipment) ? body.equipment : [],
      photo_url: body.photo_url || null,
      suggested_ministry_ids: body.suggested_ministry_ids || [],
      is_active: true,
      display_public: body.display_public ?? false,
      // Default to visible on the public calendar. Admins can opt a
      // sensitive room out via the Edit Room form; before this default
      // flipped, every newly-created room defaulted to false and the
      // public calendar always showed an empty list.
      public_visible: body.public_visible ?? true,
      // Per-room approval override (Phase 5: Fellowship Hall scenario)
      requires_approval: !!body.requires_approval,
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
