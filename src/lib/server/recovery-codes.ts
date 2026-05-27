/**
 * MFA recovery codes (Wave 4.2).
 *
 * Firebase Auth's TOTP MFA doesn't include recovery codes natively.
 * We mint our own: 8 single-use codes generated at enrollment + on
 * regeneration, bcrypt-hashed, stored in `user_recovery_codes/{uid}`.
 *
 * Storage shape:
 *   {
 *     uid: string,
 *     codes: [{ hash: string, used_at: string | null }, ...],  // length 8
 *     created_at: string,
 *     last_regenerated_at: string | null,
 *   }
 *
 * Firestore rules deny ALL client reads/writes — everything routes
 * through /api/account/mfa/* endpoints so the audit_logs trail is
 * reliable and the bcrypt hashes never leak to the client.
 *
 * The plaintext codes are returned to the caller exactly ONCE per
 * generation (the enroll + regenerate responses). After that, only
 * the hashes live anywhere — if the user loses the codes they must
 * regenerate, which invalidates the previous set.
 */

import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { adminDb } from "@/lib/firebase/admin";

/** How many codes to mint per generation. Industry standard: 8-10. */
const CODE_COUNT = 8;

/** bcrypt cost factor. 10 is the sane default; 12+ is overkill for
 * 50-bit-entropy short-string codes and pads the API response time. */
const BCRYPT_COST = 10;

/**
 * Character set for code generation. Excludes ambiguous chars (0/O, 1/I/l)
 * so users can hand-copy from a paper backup without mis-reading. The
 * 32-char alphabet × 10 chars = ~50 bits per code, plenty when paired
 * with bcrypt hashing.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface RecoveryCodeStored {
  /** bcrypt hash of the plaintext code. */
  hash: string;
  /** ISO timestamp when the code was used, or null if still valid. */
  used_at: string | null;
}

export interface RecoveryCodesDoc {
  uid: string;
  codes: RecoveryCodeStored[];
  created_at: string;
  last_regenerated_at: string | null;
}

/**
 * Generate a single plaintext recovery code formatted as XXXXX-XXXXX.
 * 10 characters from the curated alphabet, dashed in the middle for
 * readability.
 */
function generateCode(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 4) out += "-";
  }
  return out;
}

/**
 * Mint a fresh set of CODE_COUNT plaintext codes. Caller must hash
 * + persist before returning to the user — this function does NOT
 * touch Firestore.
 */
export function generateRecoveryCodes(): string[] {
  return Array.from({ length: CODE_COUNT }, generateCode);
}

/**
 * Hash a batch of plaintext codes for storage. Uses bcrypt with a
 * shared cost factor so each code costs ~100ms — fine at enrollment
 * (8 hashes serialized = ~800ms, acceptable for a one-shot flow)
 * and at verification (single hash compare = ~100ms).
 */
export async function hashCodes(plaintext: string[]): Promise<RecoveryCodeStored[]> {
  const now = new Date().toISOString();
  void now;
  const hashed = await Promise.all(
    plaintext.map(async (code) => ({
      hash: await bcrypt.hash(code, BCRYPT_COST),
      used_at: null,
    })),
  );
  return hashed;
}

/**
 * Persist a fresh code set, overwriting any prior set for this user.
 * Used by both enroll and regenerate paths.
 */
export async function persistRecoveryCodes(
  uid: string,
  codes: RecoveryCodeStored[],
  isRegeneration: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  const ref = adminDb.collection("user_recovery_codes").doc(uid);
  const existing = isRegeneration ? await ref.get() : null;
  await ref.set({
    uid,
    codes,
    created_at: existing?.exists
      ? (existing.data()?.created_at ?? now)
      : now,
    last_regenerated_at: isRegeneration ? now : null,
  } as RecoveryCodesDoc);
}

/**
 * Attempt to consume a plaintext recovery code for `uid`. Returns
 * `{ ok: true }` and marks the matched slot used; returns
 * `{ ok: false, reason }` otherwise. Uses bcrypt.compare against
 * each unused hash — O(8) per call, all serial because bcrypt is
 * already the bottleneck.
 *
 * Reasons:
 *   - "no_codes"   no recovery codes set for this user
 *   - "not_found"  no unused hash matched the submitted plaintext
 */
export async function consumeRecoveryCode(
  uid: string,
  submitted: string,
): Promise<{ ok: true } | { ok: false; reason: "no_codes" | "not_found" }> {
  const normalized = submitted.trim().toUpperCase().replace(/\s+/g, "");
  const ref = adminDb.collection("user_recovery_codes").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "no_codes" };
  const data = snap.data() as RecoveryCodesDoc | undefined;
  if (!data?.codes?.length) return { ok: false, reason: "no_codes" };

  let matchedIndex = -1;
  for (let i = 0; i < data.codes.length; i++) {
    const slot = data.codes[i];
    if (slot.used_at) continue; // skip already-used
    const ok = await bcrypt.compare(normalized, slot.hash);
    if (ok) {
      matchedIndex = i;
      break;
    }
  }
  if (matchedIndex === -1) return { ok: false, reason: "not_found" };

  // Mark the matched slot used. Use a dotted path update so we don't
  // overwrite concurrent code-use writes on other slots — for the rare
  // case where a user submits two recovery codes simultaneously.
  await ref.update({
    [`codes.${matchedIndex}.used_at`]: new Date().toISOString(),
  });
  return { ok: true };
}

/**
 * Delete a user's recovery codes doc entirely. Called when the user
 * un-enrolls from MFA — we don't want stale hashes lingering.
 */
export async function deleteRecoveryCodes(uid: string): Promise<void> {
  await adminDb.collection("user_recovery_codes").doc(uid).delete();
}

/**
 * Read-only convenience: how many unused codes remain for this user.
 * Used by the Account → Security card to show "5 of 8 codes remaining"
 * + nudge the user to regenerate when running low.
 */
export async function countRemainingRecoveryCodes(uid: string): Promise<number> {
  const snap = await adminDb.collection("user_recovery_codes").doc(uid).get();
  if (!snap.exists) return 0;
  const data = snap.data() as RecoveryCodesDoc | undefined;
  if (!data?.codes?.length) return 0;
  return data.codes.filter((c) => !c.used_at).length;
}
