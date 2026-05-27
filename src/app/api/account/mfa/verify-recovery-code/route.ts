/**
 * POST /api/account/mfa/verify-recovery-code (Wave 4.2)
 *
 * Emergency-recovery flow: user has lost their authenticator app and
 * is stuck on the sign-in MFA challenge. They submit one of the 8
 * recovery codes they saved during enrollment.
 *
 * On success the server:
 *   1. Marks that code as used (single-use; can't be replayed)
 *   2. Wipes the rest of the recovery codes doc (a recovery-code use
 *      implicitly disables MFA — user is expected to re-enroll)
 *   3. Unenrolls all TOTP factors for the user via Admin SDK so the
 *      retried sign-in goes straight through
 *   4. Emits TWO audit rows: `auth.mfa_recovery_code_used` (the
 *      action) + `auth.mfa_disabled` (the consequence)
 *
 * Auth model:
 *   No bearer token required — by definition the user can't complete
 *   sign-in yet. This is the ONLY MFA endpoint that's unauthenticated.
 *   Rate limited per-IP (10/hour) and per-email (5/hour) to slow a
 *   spray attack to a useless crawl.
 *
 * Body:
 *   { email: string, code: string }
 *
 * Response:
 *   200 → { success: true } — client should retry sign-in
 *   400 → invalid body shape
 *   429 → rate limited
 *   422 → "no_codes" or "not_found" (intentionally identical error
 *         text to the client so an attacker can't enumerate which
 *         emails have MFA enrolled)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { parseBody, z } from "@/lib/server/validation";
import { rateLimitDistributed } from "@/lib/server/rate-limit";
import { audit, userActor } from "@/lib/server/audit";
import { log } from "@/lib/log";
import {
  consumeRecoveryCode,
  deleteRecoveryCodes,
} from "@/lib/server/recovery-codes";

const BodySchema = z.object({
  email: z.string().email(),
  code: z.string().min(8).max(32),
});

export async function POST(req: NextRequest) {
  // Per-IP throttle BEFORE anything else — cheapest gate against a
  // spray attack from a single source.
  const ipLimited = await rateLimitDistributed(req, {
    prefix: "mfa-recovery-ip",
    limit: 10,
    windowSeconds: 60 * 60,
  });
  if (ipLimited) return ipLimited;

  const body = await parseBody(req, BodySchema);
  if (body instanceof NextResponse) return body;

  // Per-email throttle. Lower than IP — an attacker who knows a
  // victim's email can still only get 5 tries/hour even with a
  // distributed IP pool.
  const emailLimited = await rateLimitDistributed(req, {
    prefix: "mfa-recovery-email",
    limit: 5,
    windowSeconds: 60 * 60,
    extraKey: body.email.toLowerCase(),
  });
  if (emailLimited) return emailLimited;

  try {
    // Resolve email → uid. If the email doesn't exist, fall through to
    // the generic "invalid" response so we don't reveal account presence.
    let uid: string | null = null;
    try {
      const userRecord = await adminAuth.getUserByEmail(body.email);
      uid = userRecord.uid;
    } catch {
      // intentionally swallow — "user not found" looks identical to
      // "user found but no recovery codes" to the caller
    }

    if (!uid) {
      return NextResponse.json(
        { error: "invalid", message: "Recovery code not recognized." },
        { status: 422 },
      );
    }

    const result = await consumeRecoveryCode(uid, body.code);
    if (!result.ok) {
      return NextResponse.json(
        { error: "invalid", message: "Recovery code not recognized." },
        { status: 422 },
      );
    }

    // Code is good. Wipe remaining recovery codes (recovery-code use
    // implicitly disables MFA; re-enrollment will mint a fresh set)
    // and unenroll all TOTP factors via Admin SDK.
    await deleteRecoveryCodes(uid);
    try {
      await adminAuth.updateUser(uid, {
        multiFactor: { enrolledFactors: [] },
      });
    } catch (err) {
      // If unenroll fails, the user is still stuck on the MFA
      // challenge. Surface as 500 so the client can prompt support
      // contact rather than silently leaving them locked out.
      log.error("[mfa/verify-recovery-code] unenroll failed", { error: err, uid });
      return NextResponse.json(
        { error: "unenroll_failed", message: "Recovery succeeded but MFA could not be disabled. Contact support." },
        { status: 500 },
      );
    }

    // Dual audit — both the action and the consequence. Lets the
    // Activity feed reconstruct "Pat used a recovery code on Tue;
    // their MFA was disabled at the same moment" as two events.
    void audit({
      church_id: null,
      actor: userActor(uid),
      action: "auth.mfa_recovery_code_used",
      target_type: "user",
      target_id: uid,
      metadata: { email: body.email.toLowerCase() },
      outcome: "ok",
    });
    void audit({
      church_id: null,
      actor: userActor(uid),
      action: "auth.mfa_disabled",
      target_type: "user",
      target_id: uid,
      metadata: { path: "recovery_code_used" },
      outcome: "ok",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    log.error("[POST /api/account/mfa/verify-recovery-code]", { error: err });
    return NextResponse.json(
      { error: "internal" },
      { status: 500 },
    );
  }
}
