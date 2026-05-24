import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import type { Song, SongChartData, SongArrangement, ArrangementFormatting } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
// Server-side MIME whitelist. The client claims a Content-Type via the
// File API but a malicious caller can claim anything; this list is the
// authoritative gate. Use BOTH this list AND the `file_type` form field
// (which determines the parsing path) — they must agree.
const ALLOWED_MIME_TYPES: Record<"chordpro" | "pdf", string[]> = {
  // ChordPro files are plain text. Browsers may send these as
  // text/plain, application/octet-stream, or with no extension at all.
  chordpro: ["text/plain", "application/octet-stream", ""],
  pdf: ["application/pdf"],
};

/**
 * POST /api/songselect/upload?church_id=xxx
 *
 * Upload an original song file (ChordPro or PDF) to Firebase Storage,
 * create the Song document, and create a default SongArrangement.
 *
 * Form fields:
 *   - file: the original file
 *   - chart_data: JSON string of SongChartData
 *   - file_type: "chordpro" | "pdf"
 *
 * Query: church_id (required, used for tier gating).
 */
export async function POST(req: NextRequest) {
  try {
    // Tier-gate via query param before reading multipart body.
    const gate = await requireModuleTier(req, "worship");
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;

    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // --- Read form data ---
    const formData = await req.formData();
    const file = formData.get("file");
    const chartDataRaw = formData.get("chart_data") as string | null;
    const fileType = formData.get("file_type") as "chordpro" | "pdf" | null;

    if (!chartDataRaw || !fileType) {
      return NextResponse.json(
        { error: "Missing required fields: chart_data, file_type" },
        { status: 400 },
      );
    }

    // Server-side file validation. Codex Pass G Phase 2 retest caught
    // that the previous code silently skipped files over MAX_FILE_SIZE
    // (the user saw a successful upload that had no file attached) and
    // didn't enforce MIME whitelist (any content-type passed through to
    // Storage). Both are real Sev 3 issues; fix is to REJECT (not skip).
    if (file && !(file instanceof File)) {
      return NextResponse.json(
        { error: "Invalid file payload" },
        { status: 400 },
      );
    }
    if (file instanceof File) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` },
          { status: 400 },
        );
      }
      const allowed = ALLOWED_MIME_TYPES[fileType] ?? [];
      // Browsers vary on what Content-Type they send for ChordPro; be
      // permissive on the "" case for that file type only. PDF must be
      // explicit since it's binary.
      if (!allowed.includes(file.type)) {
        return NextResponse.json(
          {
            error: `File type "${file.type}" not allowed for ${fileType}. Expected: ${allowed.filter(Boolean).join(", ") || "PDF/ChordPro"}.`,
          },
          { status: 400 },
        );
      }
    }

    // --- Parse chart data ---
    let chartData: SongChartData;
    try {
      chartData = JSON.parse(chartDataRaw);
    } catch {
      return NextResponse.json({ error: "Invalid chart_data JSON" }, { status: 400 });
    }

    // For PDF uploads, ensure chart_data has empty sections (metadata only)
    if (fileType === "pdf" && chartData.sections.length > 0) {
      chartData = { metadata: chartData.metadata, sections: [] };
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
        const existingSong = existingSnap.docs[0];
        const existingData = existingSong.data();
        const incomingKey = metadata.original_key;

        // If this is a PDF with a different key, add it as a new arrangement
        if (fileType === "pdf" && incomingKey && !existingData.available_keys?.includes(incomingKey)) {
          let arrangementFileUrl: string | null = null;

          // Upload PDF to existing song's storage directory
          if (file && file instanceof File && file.size <= MAX_FILE_SIZE) {
            const storagePath = `churches/${churchId}/song_files/${existingSong.id}/${file instanceof File ? file.name : "chart.pdf"}`;
            const bucket = adminStorage.bucket();
            const storageFile = bucket.file(storagePath);
            const buffer = Buffer.from(await file.arrayBuffer());
            await storageFile.save(buffer, {
              metadata: { contentType: file.type || "application/pdf" },
            });
            arrangementFileUrl = storagePath;
          }

          // Create new arrangement for this key
          const arrangementData: Omit<SongArrangement, "id"> = {
            song_id: existingSong.id,
            church_id: churchId,
            name: `Key of ${incomingKey}`,
            key: incomingKey,
            chart_type: "standard",
            chart_data: chartData,
            formatting: {
              columns: 1,
              font_scale: 1.0,
              heading_bold: true,
              chord_highlight: true,
              fit_pages: null,
            },
            file_url: arrangementFileUrl,
            source_type: "pdf",
            notes: null,
            is_default: false,
            created_at: now,
            updated_by: userId,
          };

          const arrangementRef = await adminDb
            .collection("churches")
            .doc(churchId)
            .collection("arrangements")
            .add(arrangementData);

          // Update song's available_keys
          const updatedKeys = [...(existingData.available_keys || []), incomingKey];
          await existingSong.ref.update({ available_keys: updatedKeys });

          const song: Song = {
            id: existingSong.id,
            ...existingData,
            available_keys: updatedKeys,
          } as Song;

          return NextResponse.json({
            song,
            arrangement_id: arrangementRef.id,
            added_key: true,
          }, { status: 201 });
        }

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
      lyrics: fileType === "pdf" ? null : chartDataToLyrics(chartData),
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
      file_url: fileType === "pdf" ? fileUrl : null,
      source_type: fileType === "pdf" ? "pdf" : "chordpro",
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
