import { adminDb } from "@/lib/firebase/admin";

/** Uppercase alphanumeric alphabet excluding ambiguous chars (O/0, I/1, L) */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Regex that matches a valid 6-char short code */
export const SHORT_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

/** Generate a random 6-character short code and ensure uniqueness in Firestore. */
export async function generateShortCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }

    const existing = await adminDb
      .collection("churches")
      .where("short_code", "==", code)
      .limit(1)
      .get();

    if (existing.empty) return code;
  }

  throw new Error("Failed to generate unique short code after 5 attempts");
}

/** Resolve a short_code to a church_id. Returns null if not found. */
export async function resolveShortCode(code: string): Promise<string | null> {
  const snap = await adminDb
    .collection("churches")
    .where("short_code", "==", code.toUpperCase())
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].id;
}
