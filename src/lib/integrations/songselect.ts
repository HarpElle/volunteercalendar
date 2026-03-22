/**
 * SongSelect file parser.
 *
 * Parses ChordPro files (.pro, .chordpro, .cho) exported from
 * the SongSelect website (Premium subscription). Extracts title,
 * CCLI number, author/copyright info, key, tempo, time signature,
 * and structured chord chart data.
 *
 * Usage: Users download ChordPro files from songselect.ccli.com
 * and upload them here — no API credentials needed.
 */

import type { SongChartData } from "@/lib/types";
import { parseChordPro } from "@/lib/music/chordpro-parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedSong {
  title: string;
  ccli_number: string | null;
  artist_credit: string | null;
  writer_credit: string | null;
  copyright: string | null;
  default_key: string | null;
  themes: string[];
  lyrics: string | null;
  /** Structured chord chart data parsed from ChordPro. */
  chart_data: SongChartData | null;
  /** BPM from ChordPro metadata. */
  tempo: number | null;
  /** e.g., "4/4", "3/4", "6/8" */
  time_signature: string | null;
}

export interface ParseResult {
  songs: ParsedSong[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Accepted file extensions
// ---------------------------------------------------------------------------

const CHORDPRO_EXTENSIONS = new Set(["pro", "chordpro", "cho"]);

// ---------------------------------------------------------------------------
// ChordPro → ParsedSong conversion
// ---------------------------------------------------------------------------

/**
 * Convert structured SongChartData to a flat lyrics string for backward
 * compatibility with existing lyrics display.
 */
function chartDataToLyrics(chart: SongChartData): string | null {
  const parts: string[] = [];

  for (const section of chart.sections) {
    if (section.label) {
      parts.push(section.label);
    }
    for (const line of section.lines) {
      const lyricText = line.segments.map((s) => s.lyrics).join("");
      parts.push(lyricText);
    }
    parts.push(""); // blank line between sections
  }

  const result = parts.join("\n").trim();
  return result || null;
}

/**
 * Parse a ChordPro file into a ParsedSong.
 */
function parseChordProFile(content: string): ParsedSong {
  const chart = parseChordPro(content);
  const { metadata } = chart;

  return {
    title: metadata.title,
    ccli_number: metadata.ccli_number,
    artist_credit: metadata.artist,
    writer_credit: metadata.writers ?? metadata.artist,
    copyright: metadata.copyright,
    default_key: metadata.original_key,
    themes: [],
    lyrics: chartDataToLyrics(chart),
    chart_data: chart,
    tempo: metadata.tempo,
    time_signature: metadata.time_signature,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse one or more song files.
 * Accepts ChordPro files (.pro, .chordpro, .cho).
 * Each file should contain one song.
 */
export function parseSongFiles(
  files: { name: string; content: string }[],
): ParseResult {
  const songs: ParsedSong[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      const ext = file.name.toLowerCase().split(".").pop() || "";

      if (!CHORDPRO_EXTENSIONS.has(ext)) {
        errors.push(
          `${file.name}: Unsupported file type ".${ext}". Upload ChordPro files (.pro, .chordpro, .cho) from SongSelect.`,
        );
        continue;
      }

      const song = parseChordProFile(file.content);

      // Skip files that produced no meaningful data
      if (song.title === "Untitled" && !song.lyrics && !song.ccli_number) {
        errors.push(`${file.name}: Could not extract song data`);
        continue;
      }

      songs.push(song);
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : "Parse error"}`);
    }
  }

  return { songs, errors };
}
