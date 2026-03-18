import { NextResponse } from "next/server";
import { cert } from "firebase-admin/app";

/**
 * GET /api/debug
 * Temporary diagnostic endpoint. DELETE THIS FILE after debugging.
 */
export async function GET() {
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "";
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || "";
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";

  // Check if the key contains literal \n or real newlines
  const hasLiteralBackslashN = privateKey.includes("\\n");
  const hasRealNewlines = privateKey.includes("\n");
  const processedKey = privateKey.replace(/\\n/g, "\n");

  // Try to create a credential to see if it works
  let credentialError = null;
  try {
    cert({
      projectId,
      clientEmail,
      privateKey: processedKey,
    });
  } catch (err) {
    credentialError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    envPresent: {
      FIREBASE_ADMIN_KEY: !!process.env.FIREBASE_ADMIN_KEY,
      FIREBASE_ADMIN_PROJECT_ID: !!process.env.FIREBASE_ADMIN_PROJECT_ID,
      FIREBASE_ADMIN_CLIENT_EMAIL: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      FIREBASE_ADMIN_PRIVATE_KEY: !!process.env.FIREBASE_ADMIN_PRIVATE_KEY,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    },
    keyAnalysis: {
      length: privateKey.length,
      startsWithBegin: privateKey.startsWith("-----BEGIN"),
      endsWithEnd: privateKey.trimEnd().endsWith("-----"),
      hasLiteralBackslashN,
      hasRealNewlines,
      processedKeyLength: processedKey.length,
      lineCount: processedKey.split("\n").length,
    },
    credentialTest: credentialError ? { error: credentialError } : { success: true },
  });
}
