import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { isPlatformAdmin } from "@/lib/utils/platform-admin";

/**
 * GET /api/platform/me
 * Returns whether the caller is a platform superadmin.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ is_platform_admin: false });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    return NextResponse.json({ is_platform_admin: isPlatformAdmin(decoded.uid) });
  } catch {
    return NextResponse.json({ is_platform_admin: false });
  }
}
