/**
 * /api/account/mfa/recovery-codes (Wave 4.2)
 *
 * POST   — mint a fresh set of 8 recovery codes for the caller. Body
 *          `{ action: "enroll" | "regenerate" }` distinguishes first-time
 *          mint (audited as `auth.mfa_enrolled`) from a refresh
 *          (`auth.mfa_recovery_codes_regenerated`). Returns plaintext
 *          codes exactly once — only hashes persist.
 *
 * DELETE — wipe the caller's recovery codes doc. Called after a
 *          successful client-side Firebase MFA unenroll so the hashes
 *          don't linger past the MFA-enabled lifetime. Emits
 *          `auth.mfa_disabled`.
 *
 * Auth model:
 *   Both verbs require a valid Firebase ID token. The user must be
 *   currently signed in (they have a session) to touch their own
 *   recovery codes. Emergency-recovery flow (no session) lives at
 *   the sibling /verify-recovery-code endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { assertBearerToken, requireUser } from "@/lib/server/authz";
import { parseBody, z } from "@/lib/server/validation";
import { audit, userActor } from "@/lib/server/audit";
import { log } from "@/lib/log";
import {
  generateRecoveryCodes,
  hashCodes,
  persistRecoveryCodes,
  deleteRecoveryCodes,
} from "@/lib/server/recovery-codes";

const PostBodySchema = z.object({
  action: z.enum(["enroll", "regenerate"]),
});

export async function POST(req: NextRequest) {
  const noAuth = assertBearerToken(req);
  if (noAuth) return noAuth;

  const body = await parseBody(req, PostBodySchema);
  if (body instanceof NextResponse) return body;

  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;

  try {
    const plaintext = generateRecoveryCodes();
    const hashed = await hashCodes(plaintext);
    await persistRecoveryCodes(user.uid, hashed, body.action === "regenerate");

    // First-time mint = MFA enrollment event (recovery codes are step 3
    // of the enrollment wizard). Refresh = explicit regenerate action.
    void audit({
      church_id: null, // user-scoped; not tied to a single org
      actor: userActor(user.uid),
      action:
        body.action === "enroll"
          ? "auth.mfa_enrolled"
          : "auth.mfa_recovery_codes_regenerated",
      target_type: "user",
      target_id: user.uid,
      metadata: {
        code_count: plaintext.length,
      },
      outcome: "ok",
    });

    return NextResponse.json({ codes: plaintext });
  } catch (err) {
    log.error("[POST /api/account/mfa/recovery-codes]", { error: err, uid: user.uid });
    return NextResponse.json(
      { error: "Failed to generate recovery codes" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const noAuth = assertBearerToken(req);
  if (noAuth) return noAuth;

  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;

  try {
    await deleteRecoveryCodes(user.uid);

    void audit({
      church_id: null,
      actor: userActor(user.uid),
      action: "auth.mfa_disabled",
      target_type: "user",
      target_id: user.uid,
      metadata: { path: "user_disabled" },
      outcome: "ok",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    log.error("[DELETE /api/account/mfa/recovery-codes]", { error: err, uid: user.uid });
    return NextResponse.json(
      { error: "Failed to remove recovery codes" },
      { status: 500 },
    );
  }
}
