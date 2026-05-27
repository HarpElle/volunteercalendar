/**
 * Client-side wrappers around Firebase Auth's TOTP MFA APIs.
 *
 * Centralizes the SDK calls so UI components stay declarative and
 * tests can mock one module instead of the whole firebase/auth surface.
 *
 * All functions take a logged-in `User`. Enrollment and unenroll both
 * require a recent sign-in (Firebase enforces 5-minute reauth window);
 * if the user's session is stale, Firebase throws `auth/requires-recent-login`
 * and the caller should surface a re-sign-in prompt.
 */

import {
  multiFactor,
  TotpMultiFactorGenerator,
  type MultiFactorInfo,
  type User,
} from "firebase/auth";

/** Display name shown in the user's authenticator app + audit logs. */
const TOTP_DISPLAY_NAME = "VolunteerCal";

/** What we issue on the QR code — appears next to the secret in the
 * user's authenticator app entry list. */
const TOTP_ISSUER = "VolunteerCal";

/**
 * Returns the user's currently enrolled factors. Empty array means
 * MFA is off. Each entry has displayName + factorId ("totp") + uid.
 */
export function getEnrolledFactors(user: User): MultiFactorInfo[] {
  return multiFactor(user).enrolledFactors;
}

export function isMfaEnabled(user: User): boolean {
  return getEnrolledFactors(user).length > 0;
}

/**
 * Begin a TOTP enrollment session. Returns the Firebase TotpSecret
 * (needed for the assertion step) plus the otpauth:// URL the QR code
 * should encode. The caller renders the QR + shows the manual secret
 * as fallback text.
 */
export async function beginTotpEnrollment(user: User): Promise<{
  secret: ReturnType<typeof TotpMultiFactorGenerator.generateSecret> extends Promise<infer T> ? T : never;
  qrCodeUrl: string;
  manualSecret: string;
}> {
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  const qrCodeUrl = secret.generateQrCodeUrl(
    user.email ?? user.uid,
    TOTP_ISSUER,
  );
  return {
    secret,
    qrCodeUrl,
    manualSecret: secret.secretKey,
  };
}

/**
 * Finalize TOTP enrollment by submitting a code from the user's
 * authenticator. Firebase verifies + persists the factor on success;
 * throws `auth/invalid-verification-code` on a wrong code.
 */
export async function completeTotpEnrollment(
  user: User,
  secret: Awaited<ReturnType<typeof beginTotpEnrollment>>["secret"],
  oneTimeCode: string,
): Promise<void> {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
    secret,
    oneTimeCode.trim(),
  );
  await multiFactor(user).enroll(assertion, TOTP_DISPLAY_NAME);
}

/**
 * Remove every TOTP factor for this user. For VolunteerCal v1 we only
 * ever enroll a single factor, but unenroll-all is safer than picking
 * the first one and leaves the user in a clean state if anything ever
 * left an orphan factor.
 */
export async function unenrollAllFactors(user: User): Promise<number> {
  const factors = getEnrolledFactors(user);
  for (const factor of factors) {
    await multiFactor(user).unenroll(factor);
  }
  return factors.length;
}
