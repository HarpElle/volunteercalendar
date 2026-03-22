/**
 * ChordPro file parser.
 *
 * Parses the ChordPro format (as exported by SongSelect Premium) into the
 * structured `SongChartData` representation used throughout the app.
 *
 * Supported directives: title, subtitle, artist, key, tempo, time, ccli,
 * copyright, comment, start_of_xxx/end_of_xxx, new_page, column_break.
 *
 * Inline chords are enclosed in square brackets: [G]Your love [C2]O Lord
 */

import type { SongChartData, ChartSection, ChartLine, ChordSegment, SectionType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _sectionCounter = 0;
function nextSectionId(): string {
  return `sec_${++_sectionCounter}`;
}

/** Map common section type strings to the SectionType enum. */
function normalizeSectionType(raw: string): SectionType {
  const lower = raw.toLowerCase().replace(/[^a-z-]/g, "");
  const map: Record<string, SectionType> = {
    verse: "verse",
    chorus: "chorus",
    prechorus: "pre-chorus",
    "pre-chorus": "pre-chorus",
    bridge: "bridge",
    intro: "intro",
    outro: "outro",
    ending: "ending",
    interlude: "interlude",
    tag: "tag",
    instrumental: "instrumental",
    vamp: "vamp",
    turnaround: "turnaround",
  };
  return map[lower] || "misc";
}

/** Extract section type from a start_of_* directive name. */
function sectionTypeFromDirective(name: string): SectionType {
  // e.g., "start_of_verse" → "verse", "start_of_chorus" → "chorus"
  const raw = name.replace(/^start_of_/, "");
  return normalizeSectionType(raw);
}

/** Parse a single line of lyrics+chords into ChordSegments. */
function parseLyricLine(line: string): ChordSegment[] {
  const segments: ChordSegment[] = [];
  // Split on [Chord] markers
  const regex = /\[([^\]]*)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    // Any lyrics before this chord (but after the previous chord)
    if (match.index > lastIndex) {
      const textBefore = line.slice(lastIndex, match.index);
      if (segments.length > 0) {
        // Append to previous segment's lyrics
        segments[segments.length - 1].lyrics += textBefore;
      } else {
        // Lyrics before any chord
        segments.push({ chord: null, lyrics: textBefore });
      }
    }

    // Start a new segment for this chord
    segments.push({ chord: match[1] || null, lyrics: "" });
    lastIndex = regex.lastIndex;
  }

  // Remaining text after last chord
  if (lastIndex < line.length) {
    const remaining = line.slice(lastIndex);
    if (segments.length > 0) {
      segments[segments.length - 1].lyrics += remaining;
    } else {
      segments.push({ chord: null, lyrics: remaining });
    }
  }

  // If line is blank, return a single empty segment
  if (segments.length === 0) {
    segments.push({ chord: null, lyrics: "" });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Directive parsing
// ---------------------------------------------------------------------------

/** Extract a directive from a line like {title: Amazing Grace} */
function parseDirective(line: string): { name: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  const inner = trimmed.slice(1, -1).trim();
  const colonIdx = inner.indexOf(":");
  if (colonIdx === -1) {
    return { name: inner.trim().toLowerCase(), value: "" };
  }
  return {
    name: inner.slice(0, colonIdx).trim().toLowerCase(),
    value: inner.slice(colonIdx + 1).trim(),
  };
}

/** Known aliases for metadata directives. */
const TITLE_ALIASES = ["title", "t"];
const ARTIST_ALIASES = ["artist", "a", "composer"];
const SUBTITLE_ALIASES = ["subtitle", "st"];
const KEY_ALIASES = ["key", "k"];
const TEMPO_ALIASES = ["tempo", "bpm"];
const TIME_ALIASES = ["time", "time_signature"];
const CCLI_ALIASES = ["ccli", "ccli_number", "ccli song #"];
const COPYRIGHT_ALIASES = ["copyright", "footer"];

function isAlias(name: string, aliases: string[]): boolean {
  return aliases.includes(name);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a ChordPro-formatted string into structured SongChartData.
 *
 * This is a pure function with no side effects, suitable for both
 * client-side preview and server-side import.
 */
export function parseChordPro(content: string): SongChartData {
  _sectionCounter = 0;

  const metadata: SongChartData["metadata"] = {
    title: "Untitled",
    artist: null,
    writers: null,
    original_key: null,
    tempo: null,
    time_signature: null,
    ccli_number: null,
    copyright: null,
  };

  const sections: ChartSection[] = [];
  let currentSection: ChartSection | null = null;
  let inSection = false;

  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // ---- Directive ----
    const directive = parseDirective(line);
    if (directive) {
      const { name, value } = directive;

      // Metadata directives
      if (isAlias(name, TITLE_ALIASES)) {
        metadata.title = value || "Untitled";
        continue;
      }
      if (isAlias(name, ARTIST_ALIASES)) {
        metadata.artist = value || null;
        continue;
      }
      if (isAlias(name, SUBTITLE_ALIASES)) {
        // Subtitle often contains the writer(s)
        metadata.writers = value || null;
        continue;
      }
      if (isAlias(name, KEY_ALIASES)) {
        metadata.original_key = value || null;
        continue;
      }
      if (isAlias(name, TEMPO_ALIASES)) {
        const parsed = parseInt(value, 10);
        metadata.tempo = isNaN(parsed) ? null : parsed;
        continue;
      }
      if (isAlias(name, TIME_ALIASES)) {
        metadata.time_signature = value || null;
        continue;
      }
      if (isAlias(name, CCLI_ALIASES)) {
        metadata.ccli_number = value.replace(/[^\d]/g, "") || null;
        continue;
      }
      if (isAlias(name, COPYRIGHT_ALIASES)) {
        metadata.copyright = value || null;
        continue;
      }

      // Section start directives: start_of_verse, start_of_chorus, etc.
      if (name.startsWith("start_of_") || name === "sov" || name === "soc" || name === "sob") {
        // Finalize previous section
        if (currentSection) {
          sections.push(currentSection);
        }
        const type = name === "sov" ? "verse" : name === "soc" ? "chorus" : name === "sob" ? "bridge" : sectionTypeFromDirective(name);
        currentSection = {
          id: nextSectionId(),
          type,
          label: value || type.charAt(0).toUpperCase() + type.slice(1),
          lines: [],
        };
        inSection = true;
        continue;
      }

      // Section end directives
      if (name.startsWith("end_of_") || name === "eov" || name === "eoc" || name === "eob") {
        if (currentSection) {
          sections.push(currentSection);
          currentSection = null;
        }
        inSection = false;
        continue;
      }

      // Comment directive — used as section header
      if (name === "comment" || name === "c" || name === "ci") {
        // Finalize previous section
        if (currentSection) {
          sections.push(currentSection);
        }
        const type = normalizeSectionType(value.replace(/\d+/g, "").trim());
        currentSection = {
          id: nextSectionId(),
          type,
          label: value,
          lines: [],
        };
        inSection = true;
        continue;
      }

      // Skip other directives (new_page, column_break, etc.)
      continue;
    }

    // ---- Content line (lyrics with optional inline chords) ----
    const trimmedLine = line.trim();

    // Skip completely empty lines — they separate sections when using {comment:} style
    if (trimmedLine === "") {
      // If we have an open section and it has content, finalize it
      // (only when not inside a start_of/end_of block)
      if (currentSection && currentSection.lines.length > 0 && !inSection) {
        sections.push(currentSection);
        currentSection = null;
      }
      continue;
    }

    // If no section is open, create an implicit one
    if (!currentSection) {
      currentSection = {
        id: nextSectionId(),
        type: "misc",
        label: sections.length === 0 ? "Verse" : `Section ${sections.length + 1}`,
        lines: [],
      };
    }

    const segments = parseLyricLine(trimmedLine);
    const chartLine: ChartLine = { segments };
    currentSection.lines.push(chartLine);
  }

  // Finalize last section
  if (currentSection && currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  return { metadata, sections };
}
