/**
 * Music theory utilities for chord transposition and notation conversion.
 *
 * Supports:
 * - Chord parsing (root, quality, extensions, bass note)
 * - Interval-based transposition with key-aware enharmonic spelling
 * - Nashville Number System conversion
 * - Solfege conversion (fixed and movable Do)
 */

import type { SongChartData, ChartType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Chromatic scale using sharps. */
const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Chromatic scale using flats. */
const FLAT_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

/** Keys that conventionally use flats. */
const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm"]);

/** Nashville scale degree labels. */
const NASHVILLE_DEGREES = ["1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"];

/** Fixed solfege syllables (C = Do always). */
const SOLFEGE_FIXED = ["Do", "Ra", "Re", "Me", "Mi", "Fa", "Se", "Sol", "Le", "La", "Te", "Ti"];

/** Movable solfege syllables (tonic = Do). */
const SOLFEGE_MOVABLE = ["Do", "Ra", "Re", "Me", "Mi", "Fa", "Fi", "Sol", "Le", "La", "Te", "Ti"];

// ---------------------------------------------------------------------------
// Chord parsing
// ---------------------------------------------------------------------------

export interface ParsedChord {
  root: string;
  quality: string;
  extensions: string;
  bass: string | null;
}

/** All valid note names (sharps and flats). */
const NOTE_NAMES = new Set([
  "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B",
]);

/**
 * Parse a chord string into its components.
 *
 * Examples:
 * - "G" → { root: "G", quality: "", extensions: "", bass: null }
 * - "C#m7" → { root: "C#", quality: "m", extensions: "7", bass: null }
 * - "D/F#" → { root: "D", quality: "", extensions: "", bass: "F#" }
 * - "Am7sus4" → { root: "A", quality: "m", extensions: "7sus4", bass: null }
 * - "C2" → { root: "C", quality: "", extensions: "2", bass: null }
 */
export function parseChord(chord: string): ParsedChord | null {
  if (!chord || chord.trim() === "") return null;

  const trimmed = chord.trim();

  // Handle slash chords (bass note)
  let main = trimmed;
  let bass: string | null = null;
  const slashIdx = trimmed.indexOf("/");
  if (slashIdx > 0) {
    main = trimmed.slice(0, slashIdx);
    const bassStr = trimmed.slice(slashIdx + 1);
    // Validate bass note
    const bassRoot = bassStr.length >= 2 && (bassStr[1] === "#" || bassStr[1] === "b")
      ? bassStr.slice(0, 2)
      : bassStr.slice(0, 1);
    if (NOTE_NAMES.has(bassRoot)) {
      bass = bassStr;
    }
  }

  // Extract root note (1 or 2 chars)
  let root = "";
  if (main.length >= 2 && (main[1] === "#" || main[1] === "b")) {
    root = main.slice(0, 2);
  } else if (main.length >= 1) {
    root = main.slice(0, 1);
  }

  if (!NOTE_NAMES.has(root)) return null;

  const remainder = main.slice(root.length);

  // Extract quality
  let quality = "";
  if (remainder.startsWith("min") || remainder.startsWith("m") && !remainder.startsWith("maj")) {
    quality = "m";
  } else if (remainder.startsWith("dim")) {
    quality = "dim";
  } else if (remainder.startsWith("aug")) {
    quality = "aug";
  } else if (remainder.startsWith("sus")) {
    quality = "sus";
  }

  // Everything after root + quality is extensions
  let extensionStart = quality.length;
  // For "m", "dim", "aug" — match the full token in remainder
  if (quality === "m") {
    extensionStart = remainder.startsWith("min") ? 3 : 1;
  } else if (quality === "dim") {
    extensionStart = 3;
  } else if (quality === "aug") {
    extensionStart = 3;
  } else if (quality === "sus") {
    // "sus" is part of extensions, not quality by itself
    quality = "";
    extensionStart = 0;
  }

  const extensions = remainder.slice(extensionStart);

  return { root, quality, extensions, bass };
}

// ---------------------------------------------------------------------------
// Note/interval math
// ---------------------------------------------------------------------------

/** Get the chromatic index (0-11) of a note name. */
function noteToIndex(note: string): number {
  const sharpIdx = SHARP_NOTES.indexOf(note as typeof SHARP_NOTES[number]);
  if (sharpIdx >= 0) return sharpIdx;
  const flatIdx = FLAT_NOTES.indexOf(note as typeof FLAT_NOTES[number]);
  if (flatIdx >= 0) return flatIdx;
  return -1;
}

/** Get the note name at a chromatic index, using the appropriate accidental style. */
function indexToNote(index: number, useFlats: boolean): string {
  const normalized = ((index % 12) + 12) % 12;
  return useFlats ? FLAT_NOTES[normalized] : SHARP_NOTES[normalized];
}

/** Determine if a key conventionally uses flats. */
function keyUsesFlats(key: string): boolean {
  return FLAT_KEYS.has(key);
}

/** Calculate semitone distance between two keys. */
function semitoneDifference(fromKey: string, toKey: string): number {
  const fromRoot = fromKey.replace(/m(in)?$/i, "");
  const toRoot = toKey.replace(/m(in)?$/i, "");
  const fromIdx = noteToIndex(fromRoot);
  const toIdx = noteToIndex(toRoot);
  if (fromIdx < 0 || toIdx < 0) return 0;
  return ((toIdx - fromIdx) + 12) % 12;
}

// ---------------------------------------------------------------------------
// Transposition
// ---------------------------------------------------------------------------

/**
 * Transpose a single chord string by a number of semitones.
 */
export function transposeChord(chord: string, semitones: number, targetKey: string): string {
  const parsed = parseChord(chord);
  if (!parsed) return chord;

  const useFlats = keyUsesFlats(targetKey);

  const rootIdx = noteToIndex(parsed.root);
  if (rootIdx < 0) return chord;
  const newRoot = indexToNote(rootIdx + semitones, useFlats);

  let newBass = "";
  if (parsed.bass) {
    const bassRoot = parsed.bass.length >= 2 && (parsed.bass[1] === "#" || parsed.bass[1] === "b")
      ? parsed.bass.slice(0, 2)
      : parsed.bass.slice(0, 1);
    const bassRemainder = parsed.bass.slice(bassRoot.length);
    const bassIdx = noteToIndex(bassRoot);
    if (bassIdx >= 0) {
      newBass = "/" + indexToNote(bassIdx + semitones, useFlats) + bassRemainder;
    } else {
      newBass = "/" + parsed.bass;
    }
  }

  return newRoot + parsed.quality + parsed.extensions + newBass;
}

/**
 * Transpose an entire SongChartData from one key to another.
 * Returns a new object (does not mutate the original).
 */
export function transposeSongChart(
  chart: SongChartData,
  fromKey: string,
  toKey: string,
): SongChartData {
  if (fromKey === toKey) return chart;

  const semitones = semitoneDifference(fromKey, toKey);
  if (semitones === 0) return chart;

  return {
    metadata: { ...chart.metadata },
    sections: chart.sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) => ({
        segments: line.segments.map((seg) => ({
          chord: seg.chord ? transposeChord(seg.chord, semitones, toKey) : null,
          lyrics: seg.lyrics,
        })),
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Nashville Number System
// ---------------------------------------------------------------------------

/**
 * Convert a chord root to its Nashville number relative to the key.
 */
function chordToNashville(chord: string, key: string): string {
  const parsed = parseChord(chord);
  if (!parsed) return chord;

  const keyRoot = key.replace(/m(in)?$/i, "");
  const keyIdx = noteToIndex(keyRoot);
  const chordIdx = noteToIndex(parsed.root);
  if (keyIdx < 0 || chordIdx < 0) return chord;

  const degree = ((chordIdx - keyIdx) + 12) % 12;
  const nashvilleRoot = NASHVILLE_DEGREES[degree];

  let nashvilleBass = "";
  if (parsed.bass) {
    const bassRoot = parsed.bass.length >= 2 && (parsed.bass[1] === "#" || parsed.bass[1] === "b")
      ? parsed.bass.slice(0, 2)
      : parsed.bass.slice(0, 1);
    const bassIdx = noteToIndex(bassRoot);
    if (bassIdx >= 0) {
      const bassDegree = ((bassIdx - keyIdx) + 12) % 12;
      nashvilleBass = "/" + NASHVILLE_DEGREES[bassDegree];
    }
  }

  return nashvilleRoot + parsed.quality + parsed.extensions + nashvilleBass;
}

// ---------------------------------------------------------------------------
// Solfege
// ---------------------------------------------------------------------------

function chordToSolfege(chord: string, key: string, fixed: boolean): string {
  const parsed = parseChord(chord);
  if (!parsed) return chord;

  const syllables = fixed ? SOLFEGE_FIXED : SOLFEGE_MOVABLE;

  if (fixed) {
    // Fixed: C = Do always
    const chordIdx = noteToIndex(parsed.root);
    if (chordIdx < 0) return chord;
    const solfegeRoot = syllables[chordIdx];

    let solfegeBass = "";
    if (parsed.bass) {
      const bassRoot = parsed.bass.length >= 2 && (parsed.bass[1] === "#" || parsed.bass[1] === "b")
        ? parsed.bass.slice(0, 2)
        : parsed.bass.slice(0, 1);
      const bassIdx = noteToIndex(bassRoot);
      if (bassIdx >= 0) solfegeBass = "/" + syllables[bassIdx];
    }

    return solfegeRoot + parsed.quality + parsed.extensions + solfegeBass;
  } else {
    // Movable: key tonic = Do
    const keyRoot = key.replace(/m(in)?$/i, "");
    const keyIdx = noteToIndex(keyRoot);
    const chordIdx = noteToIndex(parsed.root);
    if (keyIdx < 0 || chordIdx < 0) return chord;

    const degree = ((chordIdx - keyIdx) + 12) % 12;
    const solfegeRoot = syllables[degree];

    let solfegeBass = "";
    if (parsed.bass) {
      const bassRoot = parsed.bass.length >= 2 && (parsed.bass[1] === "#" || parsed.bass[1] === "b")
        ? parsed.bass.slice(0, 2)
        : parsed.bass.slice(0, 1);
      const bassIdx = noteToIndex(bassRoot);
      if (bassIdx >= 0) {
        const bassDegree = ((bassIdx - keyIdx) + 12) % 12;
        solfegeBass = "/" + syllables[bassDegree];
      }
    }

    return solfegeRoot + parsed.quality + parsed.extensions + solfegeBass;
  }
}

// ---------------------------------------------------------------------------
// Chart type conversion
// ---------------------------------------------------------------------------

/**
 * Convert all chords in a chart to the specified notation system.
 * Returns a new object (does not mutate).
 */
export function convertChartNotation(
  chart: SongChartData,
  key: string,
  chartType: ChartType,
): SongChartData {
  if (chartType === "standard") return chart;

  const converter = (chord: string): string => {
    switch (chartType) {
      case "nashville":
        return chordToNashville(chord, key);
      case "solfege_fixed":
        return chordToSolfege(chord, key, true);
      case "solfege_movable":
        return chordToSolfege(chord, key, false);
      default:
        return chord;
    }
  };

  return {
    metadata: { ...chart.metadata },
    sections: chart.sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) => ({
        segments: line.segments.map((seg) => ({
          chord: seg.chord ? converter(seg.chord) : null,
          lyrics: seg.lyrics,
        })),
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Key list utility
// ---------------------------------------------------------------------------

/** All 12 chromatic keys in order, with enharmonic preferences. */
export const ALL_KEYS = [
  "C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
] as const;

/** All 12 keys plus common enharmonic alternatives. */
export const ALL_KEYS_WITH_ENHARMONICS = [
  "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B",
] as const;
