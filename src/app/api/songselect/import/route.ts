import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { Song } from "@/lib/types";
import type { ParsedSong } from "@/lib/integrations/songselect";

/**
 * POST /api/songselect/import
 * Import parsed songs into the church's song library.
 *
 * Body: { church_id, songs: ParsedSong[] }
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
    const { church_id, songs } = body as { church_id: string; songs: ParsedSong[] };

    if (!church_id || !Array.isArray(songs) || songs.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: church_id, songs[]" },
        { status: 400 },
      );
    }

    if (songs.length > 50) {
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

    // Check for existing songs by CCLI number to avoid duplicates
    const ccliNumbers = songs
      .map((s) => s.ccli_number)
      .filter((n): n is string => n !== null && n !== "");

    const alreadyImportedCcli = new Set<string>();

    if (ccliNumbers.length > 0) {
      // Firestore "in" queries limited to 30 elements
      for (let i = 0; i < ccliNumbers.length; i += 30) {
        const batch = ccliNumbers.slice(i, i + 30);
        const existingSnap = await adminDb
          .collection("churches")
          .doc(church_id)
          .collection("songs")
          .where("ccli_number", "in", batch)
          .get();

        for (const d of existingSnap.docs) {
          const ccli = d.data().ccli_number as string;
          if (ccli) alreadyImportedCcli.add(ccli);
        }
      }
    }

    const songsCollection = adminDb
      .collection("churches")
      .doc(church_id)
      .collection("songs");

    const imported: Song[] = [];
    const errors: { title: string; error: string }[] = [];
    let skipped = 0;

    for (const parsed of songs) {
      // Skip if CCLI number already exists in library
      if (parsed.ccli_number && alreadyImportedCcli.has(parsed.ccli_number)) {
        skipped++;
        continue;
      }

      try {
        const now = new Date().toISOString();

        const songData: Omit<Song, "id"> = {
          church_id,
          title: parsed.title,
          ccli_number: parsed.ccli_number,
          ccli_publisher: null,
          default_key: parsed.default_key,
          available_keys: parsed.default_key ? [parsed.default_key] : [],
          artist_credit: parsed.artist_credit,
          writer_credit: parsed.writer_credit,
          copyright: parsed.copyright,
          tags: parsed.themes,
          in_rotation: false,
          rotation_lists: [],
          lyric_source: "songselect",
          lyrics: parsed.lyrics,
          chord_chart_url: null,
          sheet_music_url: null,
          media_file_url: null,
          songselect_id: null,
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
          title: parsed.title,
          error: err instanceof Error ? err.message : "Import failed",
        });
      }
    }

    return NextResponse.json({
      imported: imported.length,
      skipped,
      errors,
      songs: imported,
    });
  } catch (error) {
    console.error("[POST /api/songselect/import]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
