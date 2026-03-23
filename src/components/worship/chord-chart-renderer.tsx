"use client";

import type { SongChartData, ChartSection, ChartLine } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChordChartRendererProps {
  chartData: SongChartData;
  /** Number of columns for layout (1 or 2). */
  columns?: 1 | 2;
  /** Font size multiplier (default 1.0). */
  fontScale?: number;
  /** Show section headings in bold. */
  headingBold?: boolean;
  /** Highlight chords with accent color. */
  chordHighlight?: boolean;
  /** Render in StageSync mode (dark bg, large text). */
  stageSyncMode?: boolean;
  /** Additional className for the outer wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Section type → display badge color
// ---------------------------------------------------------------------------

const SECTION_COLORS: Record<string, string> = {
  verse: "bg-vc-indigo/10 text-vc-indigo",
  chorus: "bg-vc-coral/10 text-vc-coral",
  "pre-chorus": "bg-vc-sand/30 text-vc-text",
  bridge: "bg-vc-sage/15 text-vc-sage-dark",
  intro: "bg-vc-indigo/5 text-vc-text-secondary",
  outro: "bg-vc-indigo/5 text-vc-text-secondary",
  ending: "bg-vc-indigo/5 text-vc-text-secondary",
  interlude: "bg-vc-sand/20 text-vc-text-secondary",
  tag: "bg-vc-coral/5 text-vc-coral",
  instrumental: "bg-vc-sand/20 text-vc-text-secondary",
  vamp: "bg-vc-coral/5 text-vc-coral",
  turnaround: "bg-vc-sand/20 text-vc-text-secondary",
  misc: "bg-vc-bg-warm text-vc-text-secondary",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChordChartRenderer({
  chartData,
  columns = 1,
  fontScale = 1.0,
  headingBold = true,
  chordHighlight = true,
  stageSyncMode = false,
  className = "",
}: ChordChartRendererProps) {
  const baseFontSize = stageSyncMode ? 24 : 16;
  const fontSize = baseFontSize * fontScale;
  const chordSize = fontSize * 0.85;

  const wrapperClasses = stageSyncMode
    ? `bg-[#1a1a2e] text-white p-6 rounded-xl ${className}`
    : `${className}`;

  const chordClasses = chordHighlight
    ? stageSyncMode
      ? "text-vc-coral font-semibold"
      : "bg-vc-coral/10 text-vc-coral font-semibold px-0.5 rounded"
    : stageSyncMode
      ? "text-white/70 font-semibold"
      : "text-vc-indigo font-semibold";

  return (
    <div
      className={wrapperClasses}
      style={{
        fontSize: `${fontSize}px`,
        lineHeight: 1.6,
        columnCount: columns,
        columnGap: "2rem",
      }}
    >
      {chartData.sections.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          headingBold={headingBold}
          chordClasses={chordClasses}
          chordSize={chordSize}
          stageSyncMode={stageSyncMode}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Block
// ---------------------------------------------------------------------------

function SectionBlock({
  section,
  headingBold,
  chordClasses,
  chordSize,
  stageSyncMode,
}: {
  section: ChartSection;
  headingBold: boolean;
  chordClasses: string;
  chordSize: number;
  stageSyncMode: boolean;
}) {
  const badgeColor = SECTION_COLORS[section.type] || SECTION_COLORS.misc;

  return (
    <div className="mb-5 break-inside-avoid">
      {/* Section header */}
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={`inline-block rounded-md px-2 py-0.5 text-xs uppercase tracking-wider ${
            stageSyncMode ? "bg-white/10 text-white/60" : badgeColor
          } ${headingBold ? "font-bold" : "font-semibold"}`}
        >
          {section.label}
        </span>
      </div>

      {/* Lines */}
      {section.lines.map((line, li) => (
        <LineBlock
          key={li}
          line={line}
          chordClasses={chordClasses}
          chordSize={chordSize}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line Block — inline segments with chord stacked above lyrics
// ---------------------------------------------------------------------------

function LineBlock({
  line,
  chordClasses,
  chordSize,
}: {
  line: ChartLine;
  chordClasses: string;
  chordSize: number;
}) {
  const hasChords = line.segments.some((s) => s.chord);

  return (
    <div className="mb-0.5 whitespace-pre-wrap">
      {line.segments.map((seg, si) => (
        <span
          key={si}
          style={{ display: "inline-flex", flexDirection: "column", verticalAlign: "bottom" }}
        >
          {hasChords && (
            <span
              className={seg.chord ? chordClasses : "invisible"}
              style={{ fontSize: `${chordSize}px`, lineHeight: 1.4 }}
            >
              {seg.chord || "\u00A0"}
            </span>
          )}
          <span>{seg.lyrics || "\u00A0"}</span>
        </span>
      ))}
    </div>
  );
}
