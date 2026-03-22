/**
 * SongSelect file parser.
 *
 * Parses .usr (SongSelect UserSong format) and plain-text song files
 * exported from the SongSelect website. Extracts title, CCLI number,
 * author/copyright info, key, and lyrics.
 *
 * Usage: Users download song files from songselect.ccli.com and upload
 * them here — no API credentials needed.
 */

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
}

export interface ParseResult {
  songs: ParsedSong[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// .usr file parser (SongSelect UserSong format)
// ---------------------------------------------------------------------------

/**
 * Parse a .usr (SongSelect UserSong) file.
 *
 * Format is key=value pairs like:
 *   [File]
 *   Type=SongSelect Import File
 *   [Song]
 *   Title=Amazing Grace
 *   Author=John Newton
 *   Copyright=Public Domain
 *   CCLI Song #=4669
 *   Key=G
 *   Fields=Verse 1,Verse 2,...
 *   Words=lyrics text with /n line breaks and double for stanza breaks
 */
function parseUsrFile(content: string): ParsedSong {
  const lines = content.split(/\r?\n/);
  const fields: Record<string, string> = {};

  for (const line of lines) {
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (key && value) {
      fields[key] = value;
    }
  }

  // Extract CCLI number — field may be "CCLI Song #" or "CCLISongNumber"
  const ccliRaw = fields["CCLI Song #"] || fields["CCLISongNumber"] || fields["CCLI"] || null;
  const ccliNumber = ccliRaw?.replace(/[^\d]/g, "") || null;

  // Parse lyrics — .usr uses /n for line breaks within a section
  let lyrics: string | null = null;
  const wordsRaw = fields["Words"];
  if (wordsRaw) {
    lyrics = wordsRaw
      .replace(/\/n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return {
    title: fields["Title"] || "Untitled",
    ccli_number: ccliNumber,
    artist_credit: fields["Artist"] || fields["Author"] || null,
    writer_credit: fields["Author"] || fields["Writer"] || null,
    copyright: fields["Copyright"] || null,
    default_key: fields["Key"] || fields["OriginalKey"] || null,
    themes: fields["Themes"]?.split(/[,;]/).map((t) => t.trim()).filter(Boolean) || [],
    lyrics,
  };
}

// ---------------------------------------------------------------------------
// Plain-text parser (SongSelect .txt export)
// ---------------------------------------------------------------------------

/**
 * Parse a plain-text song file from SongSelect.
 *
 * Typical format:
 *   Title line (first non-empty line)
 *   Author / Artist line
 *   Empty line
 *   CCLI Song # 12345
 *   (lyrics follow)
 */
function parseTxtFile(content: string): ParsedSong {
  const lines = content.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim().length > 0);

  const title = nonEmpty[0]?.trim() || "Untitled";
  let artist: string | null = null;
  let copyright: string | null = null;
  let ccliNumber: string | null = null;
  let defaultKey: string | null = null;

  // Scan for metadata patterns
  const lyricsStart: string[] = [];
  let metadataEnded = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // CCLI number
    const ccliMatch = line.match(/CCLI\s+(?:Song\s+)?#?\s*(\d+)/i);
    if (ccliMatch) {
      ccliNumber = ccliMatch[1];
      continue;
    }

    // Copyright line
    if (line.startsWith("©") || line.toLowerCase().startsWith("copyright")) {
      copyright = line.replace(/^©\s*/, "").replace(/^copyright\s*/i, "").trim();
      continue;
    }

    // Key indicator
    const keyMatch = line.match(/^(?:Key|Original Key)[:\s]+([A-G][b#]?(?:m|min|maj)?)/i);
    if (keyMatch) {
      defaultKey = keyMatch[1];
      continue;
    }

    // Author/artist — usually 2nd non-empty line before lyrics
    if (!metadataEnded && i > 0 && !artist && !ccliMatch && line.length < 100) {
      const looksLikeAuthor = /^(?:by\s+)?[A-Z]/.test(line) && !line.includes("\t");
      if (looksLikeAuthor && i <= 3) {
        artist = line.replace(/^by\s+/i, "").trim();
        continue;
      }
    }

    if (line === "" && i > 2) metadataEnded = true;
    if (metadataEnded || i > 4) {
      lyricsStart.push(lines[i]);
    }
  }

  const lyrics = lyricsStart.join("\n").trim() || null;

  return {
    title,
    ccli_number: ccliNumber,
    artist_credit: artist,
    writer_credit: artist,
    copyright,
    default_key: defaultKey,
    themes: [],
    lyrics,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse one or more song files. Accepts .usr and .txt content.
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
      let song: ParsedSong;

      if (ext === "usr") {
        song = parseUsrFile(file.content);
      } else {
        // Default to plain-text parser for .txt and other text formats
        song = parseTxtFile(file.content);
      }

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
