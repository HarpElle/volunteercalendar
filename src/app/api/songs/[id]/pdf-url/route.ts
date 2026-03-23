import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, adminStorage } from "@/lib/firebase/admin";

/**
 * GET /api/songs/{id}/pdf-url?church_id=xxx&key=G
 *
 * Generate a time-limited signed URL for a song's PDF file.
 * Optionally specify a key to get a specific arrangement's PDF.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;
    const { id: songId } = await params;

    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get("church_id");
    const requestedKey = searchParams.get("key");

    if (!churchId) {
      return NextResponse.json({ error: "church_id is required" }, { status: 400 });
    }

    // --- Verify membership ---
    const membershipId = `${userId}_${churchId}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    // --- Find the PDF file path ---
    let filePath: string | null = null;

    // If a specific key is requested, look for an arrangement with that key
    if (requestedKey) {
      const arrangementsSnap = await adminDb
        .collection("churches")
        .doc(churchId)
        .collection("arrangements")
        .where("song_id", "==", songId)
        .where("key", "==", requestedKey)
        .limit(1)
        .get();

      if (!arrangementsSnap.empty) {
        const arr = arrangementsSnap.docs[0].data();
        filePath = arr.file_url || null;
      }
    }

    // Fall back to the song's original_file_url
    if (!filePath) {
      const songSnap = await adminDb
        .collection("churches")
        .doc(churchId)
        .collection("songs")
        .doc(songId)
        .get();

      if (!songSnap.exists) {
        return NextResponse.json({ error: "Song not found" }, { status: 404 });
      }

      const song = songSnap.data()!;
      if (song.original_file_type !== "pdf" || !song.original_file_url) {
        return NextResponse.json({ error: "No PDF file for this song" }, { status: 404 });
      }
      filePath = song.original_file_url;
    }

    if (!filePath) {
      return NextResponse.json({ error: "No PDF file found" }, { status: 404 });
    }

    // --- Generate signed URL (15-minute expiry) ---
    const bucket = adminStorage.bucket();
    const file = bucket.file(filePath);
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 15 * 60 * 1000,
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error("[GET /api/songs/[id]/pdf-url]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
