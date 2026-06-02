/**
 * POST /api/guardian/wallet-pass-url
 *
 * Wave 10 W10-5A-UI sub-PR A. Mints a 10-minute signed URL the
 * parent can open from their phone to download the Apple Wallet
 * family pass. Mirrors the auth pattern of other /api/guardian/*
 * endpoints (token-based, no Bearer JWT required) — the parent
 * lands on /guardian via a magic link, not a full sign-in.
 *
 * Distinct from POST /api/wallet/family-pass/url (which is Bearer
 * JWT auth for signed-in admins / parents). The two endpoints
 * produce the same kind of signed URL; they just authenticate
 * differently. The signed URL itself is HMAC'd with
 * WALLET_PASS_SIGNING_SECRET and verified by the same
 * GET /api/wallet/family-pass downstream — no other code change
 * needed there.
 *
 * Body: { token, church_id }
 *   - token: the household's qr_token, the same one /api/guardian/
 *     household uses for read access.
 *   - church_id: scopes the lookup.
 *
 * Response: { url, expires_at }
 *
 * Rate limit: 12/min (same as the Bearer-JWT sibling endpoint).
 *
 * Resolves the household from BOTH `checkin_households` (legacy)
 * AND `households` (unified) by qr_token, matching the dual-shape
 * pattern in loadHouseholdPhone.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { signFamilyPassUrl } from "@/lib/server/wallet-pass/sign-url";
import { getBaseUrl } from "@/lib/utils/base-url";
import { log } from "@/lib/log";

interface PostBody {
  token?: unknown;
  church_id?: unknown;
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 12, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = (await req.json().catch(() => ({}))) as PostBody;
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const churchId =
      typeof body.church_id === "string" ? body.church_id.trim() : "";

    if (!token || !churchId) {
      return NextResponse.json(
        { error: "Missing token or church_id" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Look up household by qr_token. Try the unified `households`
    // collection first (newer orgs), fall back to legacy
    // `checkin_households`. Same dual-collection pattern as
    // loadHouseholdPhone — ensures both legacy and unified orgs work.
    let householdId: string | null = null;
    const unifiedSnap = await churchRef
      .collection("households")
      .where("qr_token", "==", token)
      .limit(1)
      .get();
    if (!unifiedSnap.empty) {
      householdId = unifiedSnap.docs[0].id;
    } else {
      const legacySnap = await churchRef
        .collection("checkin_households")
        .where("qr_token", "==", token)
        .limit(1)
        .get();
      if (!legacySnap.empty) {
        householdId = legacySnap.docs[0].id;
      }
    }

    if (!householdId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    const signed = signFamilyPassUrl(getBaseUrl(), churchId, householdId);
    return NextResponse.json(signed);
  } catch (error) {
    log.error("[POST /api/guardian/wallet-pass-url]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
