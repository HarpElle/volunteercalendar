import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";

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
    const gate = await requireModuleTier(req, "worship");
    if (!gate.ok) return gate.response;
    const { churchId } = gate.ctx;
    const { id: songId } = await params;

    const { searchParams } = new URL(req.url);
    const requestedKey = searchParams.get("key");

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
