/**
 * Wave 10 W10-5A: HMAC-signed short-lived URLs for Apple Wallet
 * `.pkpass` downloads.
 *
 * Apple Wallet's "Add to Wallet" sheet on iOS Safari is triggered
 * only by a GET response with `Content-Type: application/vnd.apple.pkpass`.
 * That means the URL has to be openable from a plain `<a href>`,
 * which means we can't attach a Bearer header in transit.
 *
 * Instead, the auth flow is two-step:
 *   1. Client POSTs to /api/wallet/family-pass/url with Bearer auth.
 *      Server validates the caller is authorized for the household,
 *      then mints a signed URL with a 10-minute expiration.
 *   2. Client opens the signed URL (or shows it as a QR for the
 *      parent to scan). Server validates the HMAC + expiration and
 *      streams back the .pkpass binary.
 *
 * The signing secret (`WALLET_PASS_SIGNING_SECRET`) is a 256-bit
 * random value held in Vercel env. If it ever rotates, all
 * outstanding signed URLs are invalidated — which is fine because
 * they only last 10 minutes anyway.
 */

import { createHmac, timingSafeEqual } from "crypto";

const TTL_SECONDS = 10 * 60;

function getSecret(): string {
  const s = process.env.WALLET_PASS_SIGNING_SECRET;
  if (!s) {
    throw new Error(
      "WALLET_PASS_SIGNING_SECRET env var is not set; wallet pass signing is disabled",
    );
  }
  return s;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export interface SignedPassUrl {
  url: string;
  expires_at: string;
}

/**
 * Mint a signed URL that returns the .pkpass binary for the given
 * household. Defaults to a 10-minute TTL; pass `nowMs` for tests.
 */
export function signFamilyPassUrl(
  baseUrl: string,
  churchId: string,
  householdId: string,
  nowMs: number = Date.now(),
): SignedPassUrl {
  const expSec = Math.floor(nowMs / 1000) + TTL_SECONDS;
  const payload = `${churchId}.${householdId}.${expSec}`;
  const sig = sign(payload, getSecret());
  const search = new URLSearchParams({
    c: churchId,
    h: householdId,
    exp: String(expSec),
    sig,
  });
  return {
    url: `${baseUrl}/api/wallet/family-pass?${search.toString()}`,
    expires_at: new Date(expSec * 1000).toISOString(),
  };
}

export interface VerifiedSignedUrl {
  church_id: string;
  household_id: string;
}

/**
 * Verify a signed URL. Returns the (church_id, household_id) pair on
 * success, or null on any failure (missing params, expired, bad sig).
 *
 * Uses `timingSafeEqual` for the signature comparison so the route
 * doesn't leak timing info to a probe trying to brute-force a
 * signature.
 */
export function verifyFamilyPassUrl(
  params: URLSearchParams,
  nowMs: number = Date.now(),
): VerifiedSignedUrl | null {
  const churchId = params.get("c");
  const householdId = params.get("h");
  const expStr = params.get("exp");
  const sig = params.get("sig");
  if (!churchId || !householdId || !expStr || !sig) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return null;
  if (exp * 1000 < nowMs) return null;

  const expected = sign(
    `${churchId}.${householdId}.${exp}`,
    getSecret(),
  );

  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  return { church_id: churchId, household_id: householdId };
}
