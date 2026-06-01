import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { randomBytes } from "crypto";

/**
 * GET /api/admin/checkin/rooms?church_id=...
 * List all rooms for a church.
 *
 * PUT /api/admin/checkin/rooms
 * Update check-in fields on a room (grades, capacity, overflow).
 */

async function verifyAdmin(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  return { userId: decoded.uid };
}

async function checkRole(userId: string, churchId: string) {
  const snap = await adminDb.doc(`memberships/${userId}_${churchId}`).get();
  if (!snap.exists) return false;
  const role = snap.data()!.role as string;
  return ["owner", "admin", "scheduler"].includes(role);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdmin(req);
    if ("error" in auth) return auth.error;

    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    if (!(await checkRole(auth.userId, churchId))) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const snap = await adminDb
      .collection(`churches/${churchId}/rooms`)
      .orderBy("name")
      .get();

    const rooms = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ rooms });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyAdmin(req);
    if ("error" in auth) return auth.error;

    const body = await req.json();
    const {
      church_id,
      room_id,
      default_grades,
      capacity,
      overflow_room_id,
      // Wave 9 P0-5 sub-PR D: per-room ratio policy
      ratio_policy,
    } = body;

    if (!church_id || !room_id) {
      return NextResponse.json(
        { error: "Missing church_id or room_id" },
        { status: 400 },
      );
    }

    if (!(await checkRole(auth.userId, church_id))) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const roomRef = adminDb.doc(`churches/${church_id}/rooms/${room_id}`);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (default_grades !== undefined) updates.default_grades = default_grades;
    if (capacity !== undefined) updates.capacity = capacity;
    if (overflow_room_id !== undefined) updates.overflow_room_id = overflow_room_id;
    // Wave 9 P0-5 sub-PR D: per-room ratio policy. Validate shape
    // strictly before persisting — admins seeing a 400 immediately
    // know the UI sent malformed data, vs a silent coercion that
    // appears to succeed.
    if (ratio_policy !== undefined) {
      if (ratio_policy === null) {
        updates.ratio_policy = null;
      } else if (typeof ratio_policy !== "object" || Array.isArray(ratio_policy)) {
        return NextResponse.json(
          { error: "ratio_policy must be an object or null" },
          { status: 400 },
        );
      } else {
        const rp = ratio_policy as Record<string, unknown>;
        const enabled = typeof rp.enabled === "boolean" ? rp.enabled : false;
        const minVol =
          typeof rp.min_volunteers === "number" && rp.min_volunteers >= 0
            ? Math.floor(rp.min_volunteers)
            : NaN;
        const maxPerVol =
          typeof rp.max_children_per_volunteer === "number" &&
          rp.max_children_per_volunteer > 0
            ? Math.floor(rp.max_children_per_volunteer)
            : NaN;
        const minUnrel =
          typeof rp.min_unrelated_adults === "number" &&
          rp.min_unrelated_adults >= 0
            ? Math.floor(rp.min_unrelated_adults)
            : NaN;
        const maxChildren =
          rp.max_children === undefined || rp.max_children === null
            ? undefined
            : typeof rp.max_children === "number" && rp.max_children > 0
              ? Math.floor(rp.max_children)
              : NaN;
        const anyBad =
          Number.isNaN(minVol) ||
          Number.isNaN(maxPerVol) ||
          Number.isNaN(minUnrel) ||
          (maxChildren !== undefined && Number.isNaN(maxChildren));
        if (anyBad) {
          return NextResponse.json(
            {
              error:
                "ratio_policy fields must be non-negative integers (max_children_per_volunteer > 0; max_children > 0 or omitted)",
            },
            { status: 400 },
          );
        }
        updates.ratio_policy = {
          enabled,
          min_volunteers: minVol,
          max_children_per_volunteer: maxPerVol,
          min_unrelated_adults: minUnrel,
          ...(maxChildren !== undefined ? { max_children: maxChildren } : {}),
        };
      }
    }

    // Generate checkin_view_token if room gets grades assigned and doesn't have one
    const existing = roomSnap.data()!;
    if (
      default_grades?.length > 0 &&
      !existing.checkin_view_token
    ) {
      updates.checkin_view_token = randomBytes(16).toString("hex");
    }

    await roomRef.update(updates);

    const updated = await roomRef.get();
    return NextResponse.json({ room: { id: updated.id, ...updated.data() } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
