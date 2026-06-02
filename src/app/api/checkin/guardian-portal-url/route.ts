/**
 * POST /api/checkin/guardian-portal-url
 *
 * Wave 10 W10-5A-UI sub-PR B. Kiosk endpoint: given a household_id
 * that the kiosk just checked in, returns the magic-link URL the
 * parent's /guardian portal lives at. The kiosk renders this URL
 * as a QR code on the post-check-in success screen so parents can
 * scan it with their phone and add the wallet pass.
 *
 * Distinct from POST /api/guardian/wallet-pass-url (parent-side,
 * token auth). This endpoint is kiosk-side (X-Kiosk-Token auth)
 * and returns the portal URL rather than the .pkpass URL directly
 * — the kiosk doesn't know which device will scan the QR, so it
 * can't mint a 10-min wallet URL ahead of time. The portal URL
 * uses the stable household qr_token and survives indefinitely.
 *
 * Auth: X-Kiosk-Token (standard kiosk-side header).
 * Body: { church_id, household_id }
 * Response: { portal_url } — full URL ready to be QR-encoded.
 *
 * Looks up the household's qr_token from BOTH `households` (unified)
 * and `checkin_households` (legacy), matching the dual-shape pattern
 * used elsewhere.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import {
  assertKioskChurchMatch,
  requireKioskToken,
} from "@/lib/server/authz";
import { getBaseUrl } from "@/lib/utils/base-url";
import { log } from "@/lib/log";

interface PostBody {
  church_id?: unknown;
  household_id?: unknown;
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  // Scope: "lookup" — a kiosk that's allowed to look up households is
  // allowed to render the post-check-in success screen, which is where
  // this URL is consumed. Both self-service and staffed kiosks have
  // lookup scope. No new KioskScope value needed.
  const kiosk = await requireKioskToken(req, "lookup");
  if (kiosk instanceof NextResponse) return kiosk;

  try {
    const body = (await req.json().catch(() => ({}))) as PostBody;
    const churchId =
      typeof body.church_id === "string" ? body.church_id.trim() : "";
    const householdId =
      typeof body.household_id === "string"
        ? body.household_id.trim()
        : "";
    if (!churchId || !householdId) {
      return NextResponse.json(
        { error: "church_id and household_id are required" },
        { status: 400 },
      );
    }

    const churchMismatch = assertKioskChurchMatch(kiosk, churchId);
    if (churchMismatch) return churchMismatch;

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Look up qr_token from unified `households` first, then legacy.
    let qrToken: string | null = null;
    const unifiedSnap = await churchRef
      .collection("households")
      .doc(householdId)
      .get();
    if (unifiedSnap.exists) {
      qrToken = (unifiedSnap.data()?.qr_token as string | null) ?? null;
    }
    if (!qrToken) {
      const legacySnap = await churchRef
        .collection("checkin_households")
        .doc(householdId)
        .get();
      if (legacySnap.exists) {
        qrToken = (legacySnap.data()?.qr_token as string | null) ?? null;
      }
    }

    if (!qrToken) {
      return NextResponse.json(
        { error: "Household has no portal token" },
        { status: 404 },
      );
    }

    const portalUrl = `${getBaseUrl()}/guardian?church_id=${encodeURIComponent(
      churchId,
    )}&token=${encodeURIComponent(qrToken)}`;

    return NextResponse.json({ portal_url: portalUrl });
  } catch (error) {
    log.error("[POST /api/checkin/guardian-portal-url]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
