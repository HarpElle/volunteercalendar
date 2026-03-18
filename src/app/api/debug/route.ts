import { NextResponse } from "next/server";
import { getApps } from "firebase-admin/app";

/**
 * GET /api/debug
 * Temporary diagnostic endpoint. DELETE THIS FILE after debugging.
 */
export async function GET() {
  // Check how many apps are already initialized
  const apps = getApps();
  const appInfo = apps.map((a) => ({
    name: a.name,
    options: {
      hasCredential: !!(a.options as Record<string, unknown>).credential,
      projectId: (a.options as Record<string, unknown>).projectId,
    },
  }));

  // Try to actually use adminDb
  let firestoreTest = null;
  try {
    // Dynamic import to see what happens fresh
    const { adminDb } = await import("@/lib/firebase/admin");
    const snap = await adminDb.collection("churches").limit(1).get();
    firestoreTest = { success: true, docCount: snap.size };
  } catch (err) {
    firestoreTest = { error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({
    existingApps: appInfo,
    firestoreTest,
    envPresent: {
      FIREBASE_ADMIN_CLIENT_EMAIL: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      FIREBASE_ADMIN_PRIVATE_KEY: !!process.env.FIREBASE_ADMIN_PRIVATE_KEY,
      FIREBASE_ADMIN_PROJECT_ID: !!process.env.FIREBASE_ADMIN_PROJECT_ID,
    },
  });
}
