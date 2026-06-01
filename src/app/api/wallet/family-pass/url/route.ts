/**
 * POST /api/wallet/family-pass/url
 *
 * Wave 10 W10-5A. Mints a 10-minute signed URL the caller can open
 * (or QR-code-share to a phone) to download their Apple Wallet
 * family pass. Why two endpoints instead of one — see
 * `src/lib/server/wallet-pass/sign-url.ts` header.
 *
 * Auth: Bearer JWT. Caller's UID must map to an adult Person doc in
 * the requested church, AND that Person must be a member of the
 * household_id passed in the body (household_ids[] on the Person
 * doc, or primary_guardian_id on the household doc).
 *
 * Body: { church_id, household_id }
 *
 * Response: { url, expires_at } — `url` is the signed GET endpoint
 * the caller should open from an iOS device.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { signFamilyPassUrl } from "@/lib/server/wallet-pass/sign-url";
import { getBaseUrl } from "@/lib/utils/base-url";
import { log } from "@/lib/log";

interface PostBody {
  church_id?: unknown;
  household_id?: unknown;
}

async function authUid(req: NextRequest): Promise<string | NextResponse> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 12, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const uid = await authUid(req);
    if (uid instanceof NextResponse) return uid;

    // requireModuleTier hoisted ABOVE req.json() — same Codex W10-3
    // lesson: the helper clones-before-consuming the body stream,
    // so if we read the body first the clone is empty.
    const gate = await requireModuleTier(req, "checkin", {
      churchIdFrom: "body",
      allowAnonymous: true,
    });
    if (!gate.ok) return gate.response;

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

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Authorization: caller must be an adult Person AND tied to the
    // household. Either path (household_ids[] on the Person OR
    // primary_guardian_id on the household doc) is acceptable —
    // legacy households may not have populated either side.
    const personSnap = await churchRef
      .collection("people")
      .where("user_id", "==", uid)
      .where("person_type", "==", "adult")
      .limit(1)
      .get();
    if (personSnap.empty) {
      return NextResponse.json(
        { error: "Not registered as an adult in this church" },
        { status: 403 },
      );
    }
    const person = personSnap.docs[0];
    const personHouseholds = Array.isArray(person.data().household_ids)
      ? (person.data().household_ids as string[])
      : [];

    let authorized = personHouseholds.includes(householdId);
    if (!authorized) {
      // Legacy fallback: check household.primary_guardian_id.
      const hhSnap = await churchRef
        .collection("households")
        .doc(householdId)
        .get();
      const primary = hhSnap.exists
        ? ((hhSnap.data()?.primary_guardian_id as string | null) ?? null)
        : null;
      if (primary && primary === person.id) authorized = true;
    }

    if (!authorized) {
      return NextResponse.json(
        {
          error:
            "You can only mint a wallet pass for a household you belong to",
        },
        { status: 403 },
      );
    }

    const signed = signFamilyPassUrl(getBaseUrl(), churchId, householdId);
    return NextResponse.json(signed);
  } catch (error) {
    log.error("[POST /api/wallet/family-pass/url]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
