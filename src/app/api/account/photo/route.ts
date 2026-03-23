import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, adminStorage } from "@/lib/firebase/admin";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * POST /api/account/photo
 * Upload a profile photo for the authenticated user.
 *
 * Form fields:
 *   - file: image file (max 5MB)
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Use JPEG, PNG, WebP, or GIF." },
        { status: 400 },
      );
    }

    // Upload to Storage
    const ext = file.name.split(".").pop() || "jpg";
    const storagePath = `users/${uid}/profile_photo_${Date.now()}.${ext}`;
    const bucket = adminStorage.bucket();
    const fileRef = bucket.file(storagePath);
    const buffer = Buffer.from(await file.arrayBuffer());

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: { uploadedBy: uid },
      },
    });

    const [signedUrl] = await fileRef.getSignedUrl({
      action: "read",
      expires: "01-01-2100",
    });

    // Delete old photo if exists
    const userDoc = await adminDb.doc(`users/${uid}`).get();
    const oldPhotoUrl = userDoc.data()?.photo_url;
    if (oldPhotoUrl) {
      try {
        const oldPath = extractStoragePath(oldPhotoUrl, bucket.name);
        if (oldPath) {
          await bucket.file(oldPath).delete().catch(() => {});
        }
      } catch {
        // Best effort cleanup
      }
    }

    // Update user profile
    await adminDb.doc(`users/${uid}`).update({ photo_url: signedUrl });

    return NextResponse.json({ photo_url: signedUrl });
  } catch (err) {
    console.error("[API /account/photo] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/account/photo
 * Remove the authenticated user's profile photo.
 */
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;

    const userDoc = await adminDb.doc(`users/${uid}`).get();
    const photoUrl = userDoc.data()?.photo_url;
    if (photoUrl) {
      const bucket = adminStorage.bucket();
      const storagePath = extractStoragePath(photoUrl, bucket.name);
      if (storagePath) {
        await bucket.file(storagePath).delete().catch(() => {});
      }
    }

    await adminDb.doc(`users/${uid}`).update({ photo_url: null });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[API /account/photo DELETE] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function extractStoragePath(url: string, bucketName: string): string | null {
  try {
    const u = new URL(url);
    const prefix = `/${bucketName}/`;
    if (u.pathname.startsWith(prefix)) {
      return decodeURIComponent(u.pathname.slice(prefix.length));
    }
    const oMatch = u.pathname.match(/\/o\/(.+)/);
    if (oMatch) {
      return decodeURIComponent(oMatch[1]);
    }
  } catch {
    // ignore
  }
  return null;
}
