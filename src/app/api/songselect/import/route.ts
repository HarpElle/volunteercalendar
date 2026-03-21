import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { songselectAdapter } from "@/lib/integrations/songselect";
import type { Song } from "@/lib/types";

/**
 * POST /api/songselect/import
 * Import one or more songs from SongSelect into the church's song library.
 *
 * Body: { church_id, songselect_ids: string[] }
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
    const { church_id, songselect_ids } = body;

    if (!church_id || !Array.isArray(songselect_ids) || songselect_ids.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: church_id, songselect_ids[]" },
        { status: 400 },
      );
    }

    if (songselect_ids.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 songs per import batch" },
        { status: 400 },
      );
    }

    // Verify admin/scheduler role
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Get stored credentials
    const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
    const churchData = churchSnap.data();
    const creds = churchData?.songselect_credentials;

    if (!creds?.email || !creds?.encrypted_password) {
      return NextResponse.json(
        { error: "SongSelect is not connected" },
        { status: 422 },
      );
    }

    const password = Buffer.from(creds.encrypted_password, "base64").toString("utf-8");

    // Check which songs are already imported
    const existingSnap = await adminDb
      .collection("churches")
      .doc(church_id)
      .collection("songs")
      .where("songselect_id", "in", songselect_ids.slice(0, 30))
      .get();

    const alreadyImported = new Set(
      existingSnap.docs.map((d) => d.data().songselect_id as string),
    );

    const toImport = songselect_ids.filter((id: string) => !alreadyImported.has(id));

    const imported: Song[] = [];
    const errors: { songselect_id: string; error: string }[] = [];

    const songsCollection = adminDb
      .collection("churches")
      .doc(church_id)
      .collection("songs");

    for (const ssId of toImport) {
      try {
        const detail = await songselectAdapter.getSongDetail(
          creds.email,
          password,
          ssId,
        );

        const now = new Date().toISOString();

        const songData: Omit<Song, "id"> = {
          church_id,
          title: detail.title,
          ccli_number: detail.ccli_number,
          ccli_publisher: detail.ccli_publisher,
          default_key: detail.default_key,
          available_keys: detail.available_keys,
          artist_credit: detail.artist_credit,
          writer_credit: detail.writer_credit,
          copyright: detail.copyright,
          tags: detail.themes,
          in_rotation: false,
          rotation_lists: [],
          lyric_source: "songselect",
          lyrics: detail.lyrics,
          chord_chart_url: null,
          sheet_music_url: null,
          media_file_url: null,
          songselect_id: detail.songselect_id,
          date_added: now,
          last_used_date: null,
          use_count: 0,
          status: "active",
          notes: null,
          created_at: now,
          updated_by: userId,
        };

        const docRef = await songsCollection.add(songData);
        imported.push({ id: docRef.id, ...songData });
      } catch (err) {
        errors.push({
          songselect_id: ssId,
          error: err instanceof Error ? err.message : "Import failed",
        });
      }
    }

    return NextResponse.json({
      imported: imported.length,
      skipped: alreadyImported.size,
      errors,
      songs: imported,
    });
  } catch (error) {
    console.error("[POST /api/songselect/import]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
