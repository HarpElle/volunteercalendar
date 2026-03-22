import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, adminStorage } from "@/lib/firebase/admin";
import type { Song, SongChartData, SongArrangement, ArrangementFormatting } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/songselect/upload
 *
 * Upload an original song file (ChordPro or PDF) to Firebase Storage,
 * create the Song document, and create a default SongArrangement.
 *
 * Form fields:
 *   - file: the original file
 *   - church_id: string
 *   - chart_data: JSON string of SongChartData
 *   - file_type: "chordpro" | "pdf"
 */
export async function POST(req: NextRequest) {
  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    // --- Read form data ---
    const formData = await req.formData();
    const file = formData.get("file");
    const churchId = formData.get("church_id") as string | null;
    const chartDataRaw = formData.get("chart_data") as string | null;
    const fileType = formData.get("file_type") as "chordpro" | "pdf" | null;

    if (!churchId || !chartDataRaw || !fileType) {
      return NextResponse.json(
        { error: "Missing required fields: church_id, chart_data, file_type" },
        { status: 400 },
      );
    }

    // --- Verify membership ---
    const membershipId = `${userId}_${churchId}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // --- Parse chart data ---
    let chartData: SongChartData;
    try {
      chartData = JSON.parse(chartDataRaw);
    } catch {
      return NextResponse.json({ error: "Invalid chart_data JSON" }, { status: 400 });
    }

    const { metadata } = chartData;
    const now = new Date().toISOString();

    // --- Check for duplicate CCLI number ---
    if (metadata.ccli_number) {
      const existingSnap = await adminDb
        .collection("churches")
        .doc(churchId)
        .collection("songs")
        .where("ccli_number", "==", metadata.ccli_number)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        return NextResponse.json(
          { error: `A song with CCLI #${metadata.ccli_number} already exists in your library` },
          { status: 409 },
        );
      }
    }

    // --- Create song document first to get ID ---
    const songData: Omit<Song, "id"> = {
      church_id: churchId,
      title: metadata.title,
      ccli_number: metadata.ccli_number,
      ccli_publisher: null,
      default_key: metadata.original_key,
      available_keys: metadata.original_key ? [metadata.original_key] : [],
      artist_credit: metadata.artist,
      writer_credit: metadata.writers ?? metadata.artist,
      copyright: metadata.copyright,
      tags: [],
      in_rotation: false,
      rotation_lists: [],
      lyric_source: "songselect",
      lyrics: chartDataToLyrics(chartData),
      chart_data: chartData,
      original_file_url: null, // Set after upload
      original_file_type: fileType,
      tempo: metadata.tempo,
      time_signature: metadata.time_signature,
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

    const songRef = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("songs")
      .add(songData);

    // --- Upload original file to Firebase Storage ---
    let fileUrl: string | null = null;

    if (file && file instanceof File && file.size <= MAX_FILE_SIZE) {
      const storagePath = `churches/${churchId}/song_files/${songRef.id}/${file.name}`;
      const bucket = adminStorage.bucket();
      const storageFile = bucket.file(storagePath);

      const buffer = Buffer.from(await file.arrayBuffer());
      await storageFile.save(buffer, {
        metadata: {
          contentType: file.type || "application/octet-stream",
        },
      });

      fileUrl = storagePath;

      // Update song with file URL
      await songRef.update({ original_file_url: fileUrl });
    }

    // --- Create default arrangement ---
    const defaultFormatting: ArrangementFormatting = {
      columns: 1,
      font_scale: 1.0,
      heading_bold: true,
      chord_highlight: true,
      fit_pages: null,
    };

    const arrangementData: Omit<SongArrangement, "id"> = {
      song_id: songRef.id,
      church_id: churchId,
      name: metadata.original_key
        ? `Key of ${metadata.original_key} — Original`
        : "Default",
      key: metadata.original_key || "C",
      chart_type: "standard",
      chart_data: chartData,
      formatting: defaultFormatting,
      notes: null,
      is_default: true,
      created_at: now,
      updated_by: userId,
    };

    const arrangementRef = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("arrangements")
      .add(arrangementData);

    const song: Song = {
      id: songRef.id,
      ...songData,
      original_file_url: fileUrl,
    };

    return NextResponse.json({
      song,
      arrangement_id: arrangementRef.id,
    }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/songselect/upload]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chartDataToLyrics(chart: SongChartData): string | null {
  const parts: string[] = [];
  for (const section of chart.sections) {
    if (section.label) parts.push(section.label);
    for (const line of section.lines) {
      parts.push(line.segments.map((s) => s.lyrics).join(""));
    }
    parts.push("");
  }
  const result = parts.join("\n").trim();
  return result || null;
}
