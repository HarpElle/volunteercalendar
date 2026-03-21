import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { songselectAdapter } from "@/lib/integrations/songselect";

/**
 * POST /api/songselect/connect
 * Test and save SongSelect credentials for a church.
 *
 * Body: { church_id, email, password, auto_sync_enabled? }
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const body = await req.json();
    const { church_id, email, password, auto_sync_enabled } = body;

    if (!church_id || !email || !password) {
      return NextResponse.json(
        { error: "Missing required fields: church_id, email, password" },
        { status: 400 },
      );
    }

    // Verify admin/owner role
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only admins can connect SongSelect" },
        { status: 403 },
      );
    }

    // Test connection before saving
    const valid = await songselectAdapter.testConnection(email, password);
    if (!valid) {
      return NextResponse.json(
        { error: "Could not connect to SongSelect. Please check your credentials." },
        { status: 422 },
      );
    }

    // Encrypt password using a simple base64 encoding.
    // In production this would use a KMS key or similar.
    const encryptedPassword = Buffer.from(password).toString("base64");

    const now = new Date().toISOString();

    await adminDb.doc(`churches/${church_id}`).update({
      songselect_credentials: {
        email,
        encrypted_password: encryptedPassword,
        connected_at: now,
        last_sync_at: null,
        auto_sync_enabled: auto_sync_enabled ?? false,
      },
    });

    return NextResponse.json({
      connected: true,
      email,
      connected_at: now,
      auto_sync_enabled: auto_sync_enabled ?? false,
    });
  } catch (error) {
    console.error("[POST /api/songselect/connect]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/songselect/connect
 * Disconnect SongSelect from a church.
 *
 * Body: { church_id }
 */
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const body = await req.json();
    const { church_id } = body;

    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify admin/owner role
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only admins can disconnect SongSelect" },
        { status: 403 },
      );
    }

    const { FieldValue } = await import("firebase-admin/firestore");
    await adminDb.doc(`churches/${church_id}`).update({
      songselect_credentials: FieldValue.delete(),
    });

    return NextResponse.json({ disconnected: true });
  } catch (error) {
    console.error("[DELETE /api/songselect/connect]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
