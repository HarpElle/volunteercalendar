/**
 * GET /api/wallet/family-pass?c=<church>&h=<household>&exp=<unix>&sig=<hmac>
 *
 * Wave 10 W10-5A. Streams back the signed `.pkpass` binary for a
 * household. The URL must have been minted by
 * `POST /api/wallet/family-pass/url` (see header there for the
 * rationale on the two-step auth flow).
 *
 * Returns:
 *   - 200 with `Content-Type: application/vnd.apple.pkpass` and
 *     `Content-Disposition: attachment; filename="family.pkpass"`
 *     — iOS Safari sees the MIME type and shows the "Add to Apple
 *     Wallet" sheet automatically.
 *   - 401/403 — signed URL missing / expired / tampered.
 *   - 404 — household doesn't exist in this church.
 *   - 500 — pass building or signing failed (almost always means
 *     the APPLE_PASSKIT_* env vars are misconfigured).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import {
  buildFamilyPassBuffer,
  type FamilyPassChild,
} from "@/lib/server/wallet-pass/builder";
import { verifyFamilyPassUrl } from "@/lib/server/wallet-pass/sign-url";
import { getBaseUrl } from "@/lib/utils/base-url";
import { audit, SYSTEM_ACTOR } from "@/lib/server/audit";
import { randomBytes } from "crypto";
import { log } from "@/lib/log";
import type { Person, WalletPass } from "@/lib/types";

// Apple's official MIME type for .pkpass bundles. iOS Safari uses
// this to trigger the "Add to Apple Wallet" sheet.
const PKPASS_MIME = "application/vnd.apple.pkpass";

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  // Verify signed URL FIRST — no DB / cert work for invalid URLs.
  const verified = verifyFamilyPassUrl(req.nextUrl.searchParams);
  if (!verified) {
    void audit({
      church_id: req.nextUrl.searchParams.get("c") || null,
      actor: SYSTEM_ACTOR,
      action: "wallet.family_pass_generated",
      target_type: "household",
      target_id: req.nextUrl.searchParams.get("h"),
      metadata: { reason: "signed_url_invalid_or_expired" },
      outcome: "denied",
    });
    return NextResponse.json(
      { error: "Signed URL is invalid or expired" },
      { status: 403 },
    );
  }
  const { church_id: churchId, household_id: householdId } = verified;

  try {
    const churchRef = adminDb.collection("churches").doc(churchId);

    // Pull household + church + children data.
    const [churchSnap, householdSnap] = await Promise.all([
      churchRef.get(),
      churchRef.collection("households").doc(householdId).get(),
    ]);
    if (!householdSnap.exists) {
      return NextResponse.json({ error: "Household not found" }, { status: 404 });
    }
    const householdData = householdSnap.data() ?? {};
    const churchName =
      (churchSnap.exists ? (churchSnap.data()?.name as string) : "") ||
      "VolunteerCal";

    // Family display name: explicit `name` field on the household
    // doc, else fall back to "The <Last> Family" derived from the
    // primary guardian's surname, else generic.
    let familyName = (householdData.name as string) || "";
    if (!familyName) {
      const primaryId = (householdData.primary_guardian_id as string | null) ?? null;
      if (primaryId) {
        const primarySnap = await churchRef
          .collection("people")
          .doc(primaryId)
          .get();
        if (primarySnap.exists) {
          const last = (primarySnap.data() as Person).last_name;
          if (last) familyName = `The ${last} Family`;
        }
      }
    }
    if (!familyName) familyName = "Family";

    // Children: query Person docs of type=child with household_ids
    // containing this household.
    const childrenSnap = await churchRef
      .collection("people")
      .where("person_type", "==", "child")
      .where("household_ids", "array-contains", householdId)
      .get();
    const children: FamilyPassChild[] = childrenSnap.docs
      .map((d) => {
        const data = d.data();
        const cp = (data.child_profile as Record<string, unknown>) ?? {};
        return {
          id: d.id,
          first_name:
            (data.preferred_name as string) ||
            (data.first_name as string) ||
            "Child",
          grade: ((cp.grade as string) ?? null) || null,
        };
      })
      .sort((a, b) => a.first_name.localeCompare(b.first_name));

    // Load or create the WalletPass record. Auth token is generated
    // once per household and persists across re-downloads so a
    // future remote-update path can validate it.
    const walletRef = churchRef
      .collection("wallet_passes")
      .doc(householdId);
    const walletSnap = await walletRef.get();
    let authToken: string;
    const nowIso = new Date().toISOString();
    if (walletSnap.exists) {
      const existing = walletSnap.data() as WalletPass;
      authToken = existing.auth_token;
      await walletRef.update({
        last_downloaded_at: nowIso,
        download_count: (existing.download_count ?? 0) + 1,
      });
    } else {
      authToken = randomBytes(24).toString("hex");
      const fresh: WalletPass = {
        id: householdId,
        church_id: churchId,
        household_id: householdId,
        auth_token: authToken,
        created_at: nowIso,
        last_downloaded_at: nowIso,
        download_count: 1,
      };
      await walletRef.set(fresh);
    }

    // Build + sign the .pkpass.
    const buffer = await buildFamilyPassBuffer({
      household_id: householdId,
      auth_token: authToken,
      family_name: familyName,
      church_name: churchName,
      children,
      support_url: `${getBaseUrl()}/help`,
    });

    void audit({
      church_id: churchId,
      actor: SYSTEM_ACTOR,
      action: "wallet.family_pass_generated",
      target_type: "household",
      target_id: householdId,
      metadata: {
        children_count: children.length,
        download_count: walletSnap.exists
          ? (walletSnap.data() as WalletPass).download_count + 1
          : 1,
      },
      outcome: "ok",
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": PKPASS_MIME,
        "Content-Disposition": 'attachment; filename="family.pkpass"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    // Capture the actual error message in the audit metadata so a
    // future "Could not build wallet pass" failure can be diagnosed
    // from audit_logs without needing to dig through Sentry. Codex
    // W10-5A retest was blocked by exactly this gap — the public
    // response stays generic for safety but we record what really
    // broke. `outcome: "failed"` is distinct from the "denied"
    // outcome we use for bad signatures.
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error("[GET /api/wallet/family-pass]", error);
    void audit({
      church_id: churchId,
      actor: SYSTEM_ACTOR,
      action: "wallet.family_pass_generated",
      target_type: "household",
      target_id: householdId,
      metadata: {
        error_message: errMsg.slice(0, 500),
        error_name:
          error instanceof Error ? error.constructor.name : "Unknown",
      },
      outcome: "failed",
    });
    return NextResponse.json(
      { error: "Could not build wallet pass" },
      { status: 500 },
    );
  }
}
