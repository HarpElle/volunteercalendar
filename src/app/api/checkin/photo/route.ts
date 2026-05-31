/**
 * Kiosk-scoped signed-URL serving for check-in photos.
 *
 * Wave 9 P0-2 sub-PR F. The kiosk needs to display block-list photos
 * during the staffed-checkout review step. Storage rules deny direct
 * client reads (foundation PR), so the kiosk fetches a short-TTL
 * signed URL via this endpoint and uses that URL in <img>.
 *
 * Distinct from /api/admin/checkin/photo (the admin-side signed-URL
 * endpoint that gates on Bearer auth). This one gates on the kiosk's
 * X-Kiosk-Token. Same underlying helper
 * (getCheckInPhotoSignedUrl).
 *
 * Cross-tenant: the `path` query parameter MUST start with
 * `churches/{kioskChurchId}/checkin-photos/`. A request with a path
 * for another church returns 403.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  assertKioskChurchMatch,
  requireKioskToken,
} from "@/lib/server/authz";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import {
  getCheckInPhotoSignedUrl,
  isCheckInPhotoPathFor,
} from "@/lib/server/checkin-photos";
import { rateLimit } from "@/lib/utils/rate-limit";
import { log } from "@/lib/log";

export async function GET(req: NextRequest) {
  const kiosk = await requireKioskToken(req, "checkout");
  if (kiosk instanceof NextResponse) return kiosk;

  const limited = rateLimit(req, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const churchId = req.nextUrl.searchParams.get("church_id");
    const path = req.nextUrl.searchParams.get("path");
    if (!churchId) {
      return NextResponse.json(
        { error: "church_id is required" },
        { status: 400 },
      );
    }
    if (!path) {
      return NextResponse.json(
        { error: "path is required" },
        { status: 400 },
      );
    }

    const mismatch = assertKioskChurchMatch(kiosk, churchId);
    if (mismatch) return mismatch;

    const gate = await requireModuleTier(req, "checkin", {
      churchIdFrom: "query",
      allowAnonymous: true,
    });
    if (!gate.ok) return gate.response;

    if (!isCheckInPhotoPathFor(path, churchId)) {
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
    log.error("[GET /api/checkin/photo]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
