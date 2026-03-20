/**
 * Push Subscription API — stores FCM tokens for push notifications.
 *
 * POST — Register or update a user's FCM token.
 * DELETE — Remove a user's FCM token (unsubscribe).
 */

import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase/admin";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader);

    const { church_id, user_id, fcm_token } = await request.json();
    if (!church_id || !user_id || !fcm_token) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify the user_id matches the token
    if (decoded.uid !== user_id) {
      return NextResponse.json({ error: "User ID mismatch" }, { status: 403 });
    }

    // Store the FCM token — use a subcollection on the user doc
    // Structure: users/{userId}/push_tokens/{tokenId}
    const tokenRef = adminDb.collection("users").doc(user_id).collection("push_tokens").doc(fcm_token);
    await tokenRef.set({
      token: fcm_token,
      church_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Push subscribe error:", error);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader);

    const { fcm_token } = await request.json();
    if (!fcm_token) {
      return NextResponse.json({ error: "Missing fcm_token" }, { status: 400 });
    }

    await adminDb
      .collection("users")
      .doc(decoded.uid)
      .collection("push_tokens")
      .doc(fcm_token)
      .delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }
}
