import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminAuth, adminDb, adminStorage } from "@/lib/firebase/admin";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * POST /api/volunteers/[id]/photo
 * Upload a profile photo for a volunteer.
 *
 * Form fields:
 *   - file: image file (max 5MB)
 *   - church_id: string
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: volunteerId } = await params;

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;

    // Read form data
    const formData = await req.formData();
    const file = formData.get("file");
    const churchId = formData.get("church_id") as string | null;

    if (!churchId) {
      return NextResponse.json({ error: "church_id is required" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Use JPEG, PNG, WebP, or GIF." }, { status: 400 });
    }

    // Verify caller is an active admin/owner/scheduler of this church
    const callerSnap = await adminDb
      .collection("memberships")
      .where("user_id", "==", uid)
      .where("church_id", "==", churchId)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (callerSnap.empty) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const callerRole = callerSnap.docs[0].data().role;
    if (!["admin", "owner", "scheduler"].includes(callerRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Verify volunteer belongs to this church
    const volDoc = await adminDb.doc(`churches/${churchId}/people/${volunteerId}`).get();
    if (!volDoc.exists) {
      return NextResponse.json({ error: "Volunteer not found" }, { status: 404 });
    }

    // Upload to Storage
    const ext = file.name.split(".").pop() || "jpg";
    const storagePath = `churches/${churchId}/volunteer_photos/${volunteerId}_${Date.now()}.${ext}`;
    const bucket = adminStorage.bucket();
    const fileRef = bucket.file(storagePath);
    const buffer = Buffer.from(await file.arrayBuffer());

    const downloadToken = randomUUID();
    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: { firebaseStorageDownloadTokens: downloadToken, uploadedBy: uid },
      },
    });

    // Build Firebase download URL (works with any bucket ACL mode)
    const encodedPath = encodeURIComponent(storagePath);
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    // Delete old photo if exists
    const oldPhotoUrl = volDoc.data()?.photo_url;
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

    // Update volunteer doc
    await adminDb.doc(`churches/${churchId}/people/${volunteerId}`).update({
      photo_url: downloadUrl,
    });

    // Sync photo to linked user account (best-effort)
    const personUserId = volDoc.data()?.user_id as string | null;
    if (personUserId) {
      adminDb.doc(`users/${personUserId}`).update({ photo_url: downloadUrl }).catch(() => {});
    }

    return NextResponse.json({ photo_url: downloadUrl });
  } catch (err) {
    console.error("[API /volunteers/[id]/photo] Error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/volunteers/[id]/photo?church_id=xxx
 * Remove a volunteer's profile photo.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: volunteerId } = await params;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;

    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "church_id is required" }, { status: 400 });
    }

    // Verify permissions
    const callerSnap = await adminDb
      .collection("memberships")
      .where("user_id", "==", uid)
      .where("church_id", "==", churchId)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (callerSnap.empty) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const callerRole = callerSnap.docs[0].data().role;
    if (!["admin", "owner", "scheduler"].includes(callerRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const volDoc = await adminDb.doc(`churches/${churchId}/people/${volunteerId}`).get();
    if (!volDoc.exists) {
      return NextResponse.json({ error: "Volunteer not found" }, { status: 404 });
    }

    const photoUrl = volDoc.data()?.photo_url;
    if (photoUrl) {
      const bucket = adminStorage.bucket();
      const storagePath = extractStoragePath(photoUrl, bucket.name);
      if (storagePath) {
        await bucket.file(storagePath).delete().catch(() => {});
      }
    }

    await adminDb.doc(`churches/${churchId}/people/${volunteerId}`).update({
      photo_url: null,
    });

    // Sync photo removal to linked user account (best-effort)
    const personUserId = volDoc.data()?.user_id as string | null;
    if (personUserId) {
      adminDb.doc(`users/${personUserId}`).update({ photo_url: null }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[API /volunteers/[id]/photo DELETE] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Extract the Storage object path from a signed URL or storage.googleapis.com URL */
function extractStoragePath(url: string, bucketName: string): string | null {
  try {
    const u = new URL(url);
    // Signed URLs: /bucketName/path/to/file
    const prefix = `/${bucketName}/`;
    if (u.pathname.startsWith(prefix)) {
      return decodeURIComponent(u.pathname.slice(prefix.length));
    }
    // storage.googleapis.com/v0/b/bucket/o/encoded%2Fpath
    const oMatch = u.pathname.match(/\/o\/(.+)/);
    if (oMatch) {
      return decodeURIComponent(oMatch[1]);
    }
  } catch {
    // ignore
  }
  return null;
}
