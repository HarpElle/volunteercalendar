import { NextResponse } from "next/server";

/**
 * GET /api/debug
 * Temporary diagnostic endpoint — shows which Firebase Admin env vars are set.
 * Does NOT reveal actual values. DELETE THIS FILE after debugging.
 */
export async function GET() {
  return NextResponse.json({
    FIREBASE_ADMIN_KEY: !!process.env.FIREBASE_ADMIN_KEY,
    FIREBASE_ADMIN_PROJECT_ID: !!process.env.FIREBASE_ADMIN_PROJECT_ID,
    FIREBASE_ADMIN_CLIENT_EMAIL: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    FIREBASE_ADMIN_PRIVATE_KEY: !!process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    FIREBASE_ADMIN_PRIVATE_KEY_LENGTH: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.length ?? 0,
    FIREBASE_ADMIN_PRIVATE_KEY_STARTS_WITH: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.substring(0, 10) ?? "",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}
