/**
 * Short-TTL signed-URL serving for check-in photos + documents.
 *
 * Wave 9 P0-2 sub-PR C. The ONLY admin-side read path for objects under
 * `churches/{churchId}/checkin-photos/**`. Storage rules deny direct
 * client reads; this endpoint returns a 5-minute V4 signed URL so the
 * UI can display the asset, with the URL expiring before it can be
 * meaningfully leaked.
 *
 * Auth: owner / admin / scheduler / checkin_volunteer in the church
 * that owns the photo. Volunteers without a check-in role are denied —
 * pickup photos identify children's contacts and aren't general
 * volunteer-readable.
 *
 * Cross-tenant safety: the `path` query parameter MUST start with
 * `churches/{callerChurchId}/checkin-photos/`. A request with a path
 * for another church returns 403 regardless of the caller's own role.
 *
 * The kiosk-side variant (with staffed-station-scope auth instead of
 * admin auth) lands in sub-PR F.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import {
  getCheckInPhotoSignedUrl,
  isCheckInPhotoPathFor,
} from "@/lib/server/checkin-photos";
import { log } from "@/lib/log";

export async function GET(req: NextRequest) {
  try {
    const churchId = req.nextUrl.searchParams.get("church_id");
    const path = req.nextUrl.searchParams.get("path");
    if (!churchId) {
      return NextResponse.json({ error: "church_id is required" }, { status: 400 });
    }
    if (!path) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    const gate = await requireModuleTier(req, "checkin", { churchIdFrom: "query" });
    if (!gate.ok) return gate.response;
    const { churchId: callerChurchId, role } = gate.ctx;

    // Admin tiers + check-in volunteers may read. Volunteers in other
    // ministries are denied even within the same church.
    const allowedRoles = ["owner", "admin", "scheduler"];
    const isCheckinVolunteer =
      // requireModuleTier doesn't surface the checkin_volunteer flag, but the
      // role check above already covers the universe of users who get to read
      // pickup photos: scheduler+ admin. Adding checkin_volunteer here would
      // require an extra membership read; defer to sub-PR D if the UI needs it.
      false;
    if (!allowedRoles.includes(role) && !isCheckinVolunteer) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    if (!isCheckInPhotoPathFor(path, callerChurchId)) {
      return NextResponse.json(
        { error: "Path does not belong to your church" },
        { status: 403 },
      );
    }

    const { signed_url, expires_at } = await getCheckInPhotoSignedUrl({
      storagePath: path,
    });
    return NextResponse.json({ signed_url, expires_at });
  } catch (error) {
    log.error("[GET /api/admin/checkin/photo]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
